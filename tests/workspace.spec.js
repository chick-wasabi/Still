import { test, expect } from '@playwright/test';
const KEY = 'still-workspace-v2';
const errors = new WeakMap();

test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  page.on('pageerror', (error) => errors.get(page).push(error.message));
  await page.clock.install({ time: new Date(2026, 9, 14, 12) });
  await page.goto('/');
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

async function saved(page) {
  await expect(page.locator('.save-status')).toContainText(/Saved on|Encrypted on/);
}
async function navigate(page, view) {
  await page
    .getByRole('button', { name: new RegExp(`^${view}(?:\\d+)?$`) })
    .first()
    .click();
}
async function createNote(page, title = 'A private moment') {
  await page.getByRole('button', { name: 'New entry', exact: true }).click();
  await page.getByLabel('Entry title').fill(title);
  await page.getByLabel('Journal content').fill('My private writing, worth keeping.');
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await saved(page);
}
async function settings(page) {
  await page.getByRole('button', { name: 'Open settings', exact: true }).first().click();
}
async function closeDialog(page) {
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
}
async function pin(page, value, oldPin) {
  if (oldPin) await page.getByLabel('Old PIN', { exact: true }).fill(oldPin);
  await page.getByLabel(/Create PIN|New PIN/, { exact: true }).fill(value);
  await page.getByLabel('Confirm PIN', { exact: true }).fill(value);
  await page.getByRole('button', { name: /Enable PIN lock|Change PIN/ }).click();
  await expect(page.getByText('PIN protection is on.', { exact: false })).toBeVisible();
}
async function unlock(page, value) {
  await page.getByLabel('Your PIN', { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Enter your sanctuary' }).click();
}
async function collection(page, name) {
  await page.getByRole('button', { name: 'Add folder', exact: true }).click();
  await page.getByLabel('Collection name').fill(name);
  await page.getByRole('button', { name: 'Save collection', exact: true }).click();
}

test('clean slate has no sample content in any view and uses readable body type', async ({
  page,
}) => {
  await expect(page.getByRole('heading', { name: 'Your story starts here.' })).toBeVisible();
  await expect(page.locator('.entry-card')).toHaveCount(0);
  await expect(page.locator('.folder-row')).toHaveCount(0);
  expect(
    await page.locator('.page-intro > p').evaluate((element) => getComputedStyle(element).fontSize),
  ).toBe('16px');
  await navigate(page, 'Tasks');
  await expect(page.getByRole('heading', { name: 'Your tasks.' })).toBeVisible();
  await expect(page.locator('.task-card')).toHaveCount(0);
  await navigate(page, 'Habits');
  await expect(page.getByRole('heading', { name: 'Your first habit starts here.' })).toBeVisible();
  await expect(page.locator('.habit-check')).toHaveCount(0);
  await saved(page);
  const data = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).data, KEY);
  expect(data.spaces[0].notes).toEqual([]);
  expect(data.spaces[0].tasks).toEqual([]);
  expect(data.spaces[0].habits).toEqual([]);
  expect(data.profile.name).toBe('');
});

test('profile name and chosen avatar persist across reload', async ({ page }) => {
  await settings(page);
  await page.getByLabel('Your name', { exact: true }).fill('Sam Rivera');
  await page.getByRole('button', { name: 'Choose avatar', exact: true }).click();
  await page.getByRole('button', { name: 'Use 🌙', exact: true }).click();
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await closeDialog(page);
  await expect(page.getByRole('heading', { name: /Good afternoon, Sam/ })).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Good afternoon, Sam/ })).toBeVisible();
  await expect(page.locator('.topbar .avatar')).toHaveText('🌙');
  await expect(page.locator('.profile-button')).toContainText('Sam Rivera');
});

test('calendar, formatting preview, scratchpad, dirty changes and search work', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Previous month', exact: true }).click();
  await expect(page.locator('.calendar-controls h2')).toContainText('September');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.locator('.calendar-day[aria-current="date"]').click();
  await page.getByLabel('Entry title').fill('A private moment');
  const area = page.getByLabel('Journal content');
  await area.fill('A bold thought');
  await area.selectText();
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(area).toHaveValue('**A bold thought**');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('.markdown-preview strong')).toHaveText('A bold thought');
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await saved(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'A private moment' })).toBeVisible();
  await page.getByRole('button', { name: 'Add a scratchpad thought' }).click();
  await expect(page.getByLabel('Entry date')).toHaveValue('');
  await page.getByLabel('Entry title').fill('An undated idea');
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await page.getByLabel('Filter entries').selectOption('scratch');
  await expect(page.locator('.entry-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Search workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search workspace', exact: true }).fill('private');
  await page.locator('.search-results button').click();
  await page.getByLabel('Entry title').fill('Unsaved edit');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('collections support nested parents, emoji, note moves, reordering, and safe deletion', async ({
  page,
}) => {
  await collection(page, 'Personal');
  await page.getByRole('button', { name: 'Options for Personal' }).click();
  await page.getByRole('button', { name: 'Add subcollection', exact: true }).click();
  await page.getByLabel('Collection name').fill('Reflections');
  await page.getByRole('button', { name: 'Choose emoji', exact: true }).click();
  await page.getByRole('button', { name: 'Use 🌿', exact: true }).click();
  await page.getByRole('button', { name: 'Save collection', exact: true }).click();
  await page.getByRole('button', { name: 'Options for Personal' }).click();
  await page.getByRole('button', { name: 'Edit collection', exact: true }).click();
  await expect(page.getByLabel('Parent collection').locator('option')).toHaveCount(1);
  await closeDialog(page);
  await createNote(page, 'Keep this writing');
  await page.locator('.tree-note').dragTo(
    page.locator('.folder-row').filter({
      has: page.getByRole('button', { name: 'Open collection Reflections', exact: true }),
    }),
  );
  await expect
    .poll(async () =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)).data.spaces[0].notes[0].folder,
        KEY,
      ),
    )
    .not.toBeNull();
  await collection(page, 'Projects');
  await page.getByRole('button', { name: 'Options for Projects' }).click();
  await page.getByRole('button', { name: 'Move up', exact: true }).click();
  await expect(page.locator('.folder-row').first()).toContainText('Projects');
  await page.getByRole('button', { name: 'Options for Personal' }).click();
  await page.getByRole('button', { name: 'Delete collection', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete collection', exact: true })
    .click();
  await saved(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Keep this writing' })).toBeVisible();
  await expect(page.locator('.folder-row')).toHaveCount(2);
  await expect(
    page.getByRole('button', { name: 'Open collection Reflections', exact: true }),
  ).toBeVisible();
});

test('sticky tasks add instantly, move sections, update dates and repeat independently each day', async ({
  page,
}) => {
  await navigate(page, 'Tasks');
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'New task', exact: true })
    .fill('Publish a thoughtful update');
  await page.getByRole('textbox', { name: 'New task', exact: true }).press('Enter');
  await expect(page.locator('.sticky-task')).toHaveCount(1);
  await expect(page.getByLabel('Priority', { exact: true })).toHaveCount(0);
  await page
    .locator('.task-drag-handle')
    .dragTo(page.locator('.notepad-upcoming .notepad-section-heading'));
  await expect(page.getByLabel('Due date of Publish a thoughtful update')).toHaveValue(
    '2026-10-15',
  );
  await page
    .getByRole('button', { name: 'Mark Publish a thoughtful update complete', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Mark Publish a thoughtful update incomplete', exact: true }),
  ).toBeVisible();
  await page.getByLabel('New task section').selectOption('daily');
  await page.getByRole('textbox', { name: 'New task', exact: true }).fill('A daily stretch');
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await page.getByRole('button', { name: 'Mark A daily stretch complete', exact: true }).click();
  await saved(page);
  await page.reload();
  await navigate(page, 'Tasks');
  await expect(
    page.getByRole('button', { name: 'Mark A daily stretch incomplete', exact: true }),
  ).toBeVisible();
  await page.clock.fastForward('12:00:01');
  await expect(
    page.getByRole('button', { name: 'Mark A daily stretch complete', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Delete Publish a thoughtful update', exact: true })
    .click();
  await page.getByRole('button', { name: 'Delete task', exact: true }).click();
  await expect(page.locator('.sticky-task')).toHaveCount(1);
});

test('habit checks update streaks, survive editing and reload, and forbid future completion', async ({
  page,
}) => {
  await navigate(page, 'Habits');
  await page.getByRole('button', { name: 'New habit', exact: true }).click();
  await page.getByLabel('Your daily ritual').fill('Read a page');
  await page.getByRole('button', { name: 'Save habit', exact: true }).click();
  await page.getByRole('button', { name: 'Read a page, 2026-10-13', exact: true }).click();
  await page.getByRole('button', { name: 'Read a page, 2026-10-14', exact: true }).click();
  await expect(page.getByLabel('2 day current streak')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Read a page, 2026-10-15', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Edit Read a page', exact: true }).click();
  await page.getByLabel('Your daily ritual').fill('Read two pages');
  await page.getByRole('button', { name: 'Save habit', exact: true }).click();
  await saved(page);
  await page.reload();
  await navigate(page, 'Habits');
  await expect(page.getByLabel('2 day current streak')).toBeVisible();
  await page.getByRole('button', { name: 'Read two pages, 2026-10-14', exact: true }).click();
  await expect(page.getByLabel('1 day current streak')).toBeVisible();
  await page.getByRole('button', { name: 'Previous week', exact: true }).click();
  await expect(page.locator('.habit-check[aria-pressed="true"]')).toHaveCount(0);
});

test('PIN encrypts content, locks on reload, rejects wrong PIN, changes and removes securely', async ({
  page,
}) => {
  // Several 600,000-round key derivations and reloads are deliberately expensive.
  test.setTimeout(60000);
  await createNote(page, 'Secret diary');
  await settings(page);
  await page.getByLabel('Your name', { exact: true }).fill('Private Name');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await pin(page, '826193');
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(storage).not.toContain('Secret diary');
  expect(storage).not.toContain('Private Name');
  expect(storage).not.toContain('826193');
  await closeDialog(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your sanctuary awaits.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Secret diary' })).toHaveCount(0);
  await unlock(page, '000000');
  await expect(page.getByRole('alert')).toContainText('didn’t unlock');
  await unlock(page, '826193');
  await expect(page.getByRole('heading', { name: 'Secret diary' })).toBeVisible();
  await saved(page);
  await settings(page);
  await pin(page, '572914', '826193');
  await closeDialog(page);
  await page.locator('.topbar').getByRole('button', { name: 'Lock workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Your sanctuary awaits.' })).toBeVisible();
  await unlock(page, '826193');
  await expect(page.getByRole('alert')).toBeVisible();
  await unlock(page, '572914');
  await settings(page);
  await page.getByLabel('Old PIN', { exact: true }).fill('572914');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Turn off lock', exact: true }).click();
  await expect(page.getByText('PIN protection is off.', { exact: true })).toBeVisible();
  await closeDialog(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Secret diary' })).toBeVisible();
});

test('changing PIN protection locks another open tab before it can overwrite encrypted data', async ({
  page,
  context,
}) => {
  await createNote(page, 'Shared local content');
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByRole('heading', { name: 'Shared local content' })).toBeVisible();
  await settings(page);
  await pin(page, '358102');
  await expect(other.getByRole('heading', { name: 'Your sanctuary awaits.' })).toBeVisible();
  expect(await other.evaluate((key) => JSON.parse(localStorage.getItem(key)).encrypted, KEY)).toBe(
    true,
  );
  await other.close();
});

test('storage failure is visible and retry preserves in-memory writing', async ({ page }) => {
  await page.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'still-workspace-v2')
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return window.originalSetItem.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'New entry', exact: true }).click();
  await page.getByLabel('Entry title').fill('Do not lose me');
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await expect(page.locator('.storage-error')).toContainText('Could not save');
  await expect(page.getByRole('heading', { name: 'Do not lose me' })).toBeVisible();
  await page.evaluate(() => {
    Storage.prototype.setItem = window.originalSetItem;
  });
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await saved(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Do not lose me' })).toBeVisible();
});

test('mobile layout, navigation and settings remain usable without page overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  for (const view of ['Journal', 'Tasks', 'Habits']) {
    await navigate(page, view);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await settings(page);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Your name', { exact: true }).fill('Mobile User');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await closeDialog(page);
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add folder', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close navigation', exact: true }).click();
  await navigate(page, 'Journal');
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/still-v2-mobile.png', fullPage: true });
});

test('encrypted edits survive reload and remain absent from plaintext browser storage', async ({
  page,
}) => {
  await settings(page);
  await pin(page, '631829');
  await closeDialog(page);
  await createNote(page, 'Encrypted entry created after PIN');
  await page.getByRole('button', { name: 'Add a scratchpad thought' }).click();
  await page.getByLabel('Entry title').fill('Encrypted scratchpad');
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await saved(page);
  const raw = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(raw).not.toContain('Encrypted entry created');
  expect(raw).not.toContain('Encrypted scratchpad');
  await page.reload();
  await unlock(page, '631829');
  await expect(page.locator('.entry-card')).toHaveCount(2);
  await expect(
    page.getByRole('heading', { name: 'Encrypted scratchpad', exact: true }),
  ).toBeVisible();
});

test('corrupt data is reported and preserved, not silently replaced with a blank workspace', async ({
  page,
}) => {
  await page.evaluate((key) => localStorage.setItem(key, '{invalid-json'), KEY);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'We couldn’t open this workspace.' }),
  ).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe('{invalid-json');
});

test('dialogs trap focus and reduced-motion users can switch views and close with Escape', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await settings(page);
  await page.getByRole('button', { name: 'Close dialog' }).focus();
  await page.keyboard.press('Shift+Tab');
  expect(
    await page.evaluate(() => document.activeElement.closest('[role="dialog"]') !== null),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await navigate(page, 'Tasks');
  await navigate(page, 'Habits');
  await navigate(page, 'Journal');
  await expect(page.getByRole('heading', { name: 'Your journal', exact: true })).toBeVisible();
});

async function switchSpace(page, name) {
  await page.getByRole('button', { name: /^Switch workspace, current:/ }).click();
  await page.getByRole('menuitemradio', { name: new RegExp(name) }).click();
  await saved(page);
}
async function setupRecovery(page, pinValue = '631829') {
  await settings(page);
  await pin(page, pinValue);
  await page.getByRole('button', { name: 'Set up local recovery', exact: true }).click();
  await page.getByLabel('Current PIN for recovery', { exact: true }).fill(pinValue);
  await page
    .getByLabel('Recovery question', { exact: true })
    .fill('Which private phrase takes me home?');
  await page
    .getByLabel('Private recovery answer', { exact: true })
    .fill('The silver river carries quiet stars.');
  await page
    .getByLabel('Confirm recovery answer', { exact: true })
    .fill('The silver river carries quiet stars.');
  await page
    .getByLabel('Hint (optional, visible while locked)', { exact: true })
    .fill('A river, never an address.');
  await page.getByRole('button', { name: 'Save local recovery', exact: true }).click();
  await expect(page.getByText('Local recovery is enabled.', { exact: false })).toBeVisible();
  await closeDialog(page);
}

test('Personal and Work isolate journals, collections, tasks and habits, with active space retained', async ({
  page,
}) => {
  await createNote(page, 'Personal writing');
  await collection(page, 'Home');
  await navigate(page, 'Tasks');
  await page.getByRole('textbox', { name: 'New task', exact: true }).fill('Personal task');
  await page.getByRole('textbox', { name: 'New task', exact: true }).press('Enter');
  await navigate(page, 'Habits');
  await page.getByRole('button', { name: 'New habit', exact: true }).click();
  await page.getByLabel('Your daily ritual').fill('Personal ritual');
  await page.getByRole('button', { name: 'Save habit', exact: true }).click();
  await switchSpace(page, 'Work');
  await expect(page.locator('.entry-card')).toHaveCount(0);
  await expect(page.locator('.folder-row')).toHaveCount(0);
  await navigate(page, 'Tasks');
  await expect(page.locator('.sticky-task')).toHaveCount(0);
  await navigate(page, 'Habits');
  await expect(page.locator('.habit-check')).toHaveCount(0);
  await navigate(page, 'Journal');
  await createNote(page, 'Work writing');
  await collection(page, 'Projects');
  await saved(page);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Switch workspace, current: Work' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Work writing', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Personal writing', exact: true })).toHaveCount(0);
  await switchSpace(page, 'Personal');
  await expect(page.getByRole('heading', { name: 'Personal writing', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open collection Home', exact: true }),
  ).toBeVisible();
  await navigate(page, 'Tasks');
  await expect(page.locator('.sticky-title')).toHaveText('Personal task');
  await navigate(page, 'Habits');
  await expect(
    page.getByRole('button', { name: 'Edit Personal ritual', exact: true }),
  ).toBeVisible();
});

test('centered editor allows empty untitled entries with no emoji, mood or collection', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'New entry', exact: true }).click();
  await expect(page.getByLabel('Folder', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Mood', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Entry emoji', exact: true })).toHaveText('');
  const box = await page.getByRole('dialog').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(48);
  expect(1440 - box.x - box.width).toBeGreaterThanOrEqual(48);
  expect(Math.abs(box.x - (1440 - box.x - box.width))).toBeLessThan(3);
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await saved(page);
  const note = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)).data.spaces[0].notes[0],
    KEY,
  );
  expect(note.title).toBe('');
  expect(note.body).toBe('');
  expect(note.mood).toBe('');
  expect(note.emoji).toBe('');
  expect(note.folder).toBeNull();
  await expect(page.getByRole('heading', { name: 'Untitled', exact: true })).toBeVisible();
  await page.locator('.entry-card').click();
  await page.getByRole('button', { name: 'Entry emoji', exact: true }).click();
  await page.getByRole('button', { name: 'Companions', exact: true }).click();
  await page.getByRole('button', { name: 'Use 🦦', exact: true }).click();
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await saved(page);
  await page.reload();
  await expect(page.locator('.entry-icon')).toHaveText('🦦');
});

test('changing a PIN rejects the wrong old PIN and keeps the existing vault intact', async ({
  page,
}) => {
  await createNote(page, 'PIN-protected writing');
  await settings(page);
  await pin(page, '631829');
  await page.getByLabel('Old PIN', { exact: true }).fill('000000');
  await page.getByLabel('New PIN', { exact: true }).fill('823961');
  await page.getByLabel('Confirm PIN', { exact: true }).fill('823961');
  await page.getByRole('button', { name: 'Change PIN', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Old PIN is incorrect');
  await closeDialog(page);
  await page.reload();
  await unlock(page, '631829');
  await expect(
    page.getByRole('heading', { name: 'PIN-protected writing', exact: true }),
  ).toBeVisible();
});

test('local recovery resets a forgotten PIN using only a private answer and preserves the latest encrypted data', async ({
  page,
}) => {
  await createNote(page, 'Writing before recovery');
  await setupRecovery(page);
  await createNote(page, 'Writing after recovery');
  const raw = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(raw).not.toContain('The silver river carries quiet stars.');
  expect(raw).not.toContain('Writing after recovery');
  const envelope = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
  expect(envelope.recovery.question).toBe('Which private phrase takes me home?');
  expect(envelope.recovery.hint).toBe('A river, never an address.');
  expect(envelope.recovery.key).toBeUndefined();
  await page.reload();
  await page.getByRole('button', { name: 'Forgot your PIN?', exact: true }).click();
  await expect(
    page.getByText('Which private phrase takes me home?', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Show hint', exact: true }).click();
  await expect(page.getByText('A river, never an address.', { exact: true })).toBeVisible();
  await page.getByLabel('Recovery answer', { exact: true }).fill('An incorrect but long answer.');
  await page.getByLabel('New PIN', { exact: true }).fill('823961');
  await page.getByLabel('Confirm new PIN', { exact: true }).fill('823961');
  await page.getByRole('button', { name: 'Reset PIN & unlock', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('didn’t unlock');
  await page
    .getByLabel('Recovery answer', { exact: true })
    .fill('The silver river carries quiet stars.');
  await page.getByRole('button', { name: 'Reset PIN & unlock', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Writing after recovery', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.entry-card')).toHaveCount(2);
  await saved(page);
  await page.reload();
  await unlock(page, '631829');
  await expect(page.getByRole('alert')).toBeVisible();
  await unlock(page, '823961');
  await expect(
    page.getByRole('heading', { name: 'Writing after recovery', exact: true }),
  ).toBeVisible();
});

test('recovery can be removed with the current PIN and is unavailable afterward', async ({
  page,
}) => {
  await setupRecovery(page);
  await settings(page);
  await page.getByRole('button', { name: 'Manage recovery', exact: true }).click();
  await page.getByLabel('Current PIN for recovery', { exact: true }).fill('631829');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Remove recovery', exact: true }).click();
  await expect(page.getByText('Local recovery is off.', { exact: true })).toBeVisible();
  await closeDialog(page);
  await saved(page);
  await page.reload();
  await page.getByRole('button', { name: 'Forgot your PIN?', exact: true }).click();
  await expect(
    page.getByText('Local recovery wasn’t enabled for this vault.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset PIN & unlock', exact: true })).toHaveCount(
    0,
  );
});

test('existing encrypted single-workspace data migrates without losing writing', async ({
  page,
}) => {
  const { emptyWorkspace } = await import('../src/data.js');
  const { createCredentials, seal } = await import('../src/lib/vault.js');
  const data = {
    ...emptyWorkspace(),
    notes: [
      {
        id: 'legacy-owned',
        title: 'Original writing',
        body: 'Keep all my words.',
        emoji: '',
        date: '2026-10-14',
        folder: null,
        mood: '',
      },
    ],
  };
  const envelope = await seal(data, await createCredentials('631829'));
  await page.evaluate(({ key, envelope }) => localStorage.setItem(key, JSON.stringify(envelope)), {
    key: KEY,
    envelope,
  });
  await page.reload();
  await unlock(page, '631829');
  await expect(page.getByRole('heading', { name: 'Original writing', exact: true })).toBeVisible();
  await switchSpace(page, 'Work');
  await expect(page.locator('.entry-card')).toHaveCount(0);
  await switchSpace(page, 'Personal');
  await expect(page.getByRole('heading', { name: 'Original writing', exact: true })).toBeVisible();
});

test('journal drafts are encrypted, recover after reload, and stay isolated in their workspace', async ({
  page,
}) => {
  await settings(page);
  await pin(page, '631829');
  await closeDialog(page);
  await page.getByRole('button', { name: 'New entry', exact: true }).click();
  await page.getByLabel('Entry title').fill('A draft worth keeping');
  await page.getByLabel('Journal content').fill('Private draft text, before I pressed save.');
  await page.clock.fastForward(500);
  await saved(page);
  const raw = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(raw).not.toContain('Private draft text');
  await page.reload();
  await unlock(page, '631829');
  await expect(page.getByRole('region', { name: 'Journal drafts' })).toContainText(
    'A draft worth keeping',
  );
  await expect(page.locator('.entry-card')).toHaveCount(0);
  await switchSpace(page, 'Work');
  await expect(page.getByRole('region', { name: 'Journal drafts' })).toHaveCount(0);
  await switchSpace(page, 'Personal');
  await page.locator('.draft-card').click();
  await expect(page.getByLabel('Journal content')).toHaveValue(
    'Private draft text, before I pressed save.',
  );
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await saved(page);
  await expect(page.getByRole('region', { name: 'Journal drafts' })).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'A draft worth keeping', exact: true }),
  ).toBeVisible();
});
