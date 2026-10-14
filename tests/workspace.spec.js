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
async function pin(page, value) {
  await page.getByLabel(/Create PIN|New PIN/, { exact: true }).fill(value);
  await page.getByLabel('Confirm PIN', { exact: true }).fill(value);
  await page.getByRole('button', { name: /Enable PIN lock|Change PIN/ }).click();
  await expect(page.getByText('PIN protection is on.', { exact: false })).toBeVisible();
}
async function unlock(page, value) {
  await page.getByLabel('Your PIN', { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Unlock your space' }).click();
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
  await expect(page.getByRole('heading', { name: 'Make room for your next step.' })).toBeVisible();
  await expect(page.locator('.task-card')).toHaveCount(0);
  await navigate(page, 'Habits');
  await expect(page.getByRole('heading', { name: 'Plant your first small habit.' })).toBeVisible();
  await expect(page.locator('.habit-check')).toHaveCount(0);
  await saved(page);
  const data = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).data, KEY);
  expect(data.notes).toEqual([]);
  expect(data.tasks).toEqual([]);
  expect(data.habits).toEqual([]);
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
      page.evaluate((key) => JSON.parse(localStorage.getItem(key)).data.notes[0].folder, KEY),
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

test('tasks support priority, date, board drag, completion, list status and deletion', async ({
  page,
}) => {
  await navigate(page, 'Tasks');
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  await page.getByLabel('Task name').fill('Publish a thoughtful update');
  await page.getByLabel('Priority', { exact: true }).selectOption('High');
  await page.getByLabel('Due date', { exact: true }).fill('2026-10-15');
  await page.getByRole('button', { name: 'Save task', exact: true }).click();
  await expect(page.locator('.priority')).toHaveText('High');
  await page.locator('.task-card').dragTo(page.getByRole('region', { name: 'In Progress column' }));
  await expect(page.getByLabel('Status of Publish a thoughtful update')).toHaveValue('In Progress');
  await page
    .getByRole('button', { name: 'Mark Publish a thoughtful update complete', exact: true })
    .click();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.getByLabel('Status of Publish a thoughtful update')).toHaveValue('Done');
  await page.getByLabel('Status of Publish a thoughtful update').selectOption('To Do');
  await saved(page);
  await page.reload();
  await navigate(page, 'Tasks');
  await expect(page.getByLabel('Status of Publish a thoughtful update')).toHaveValue('To Do');
  await page
    .getByRole('button', { name: 'Delete Publish a thoughtful update', exact: true })
    .click();
  await page.getByRole('button', { name: 'Delete task', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Make room for your next step.' })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Secret diary' })).toHaveCount(0);
  await unlock(page, '000000');
  await expect(page.getByRole('alert')).toContainText('didn’t unlock');
  await unlock(page, '826193');
  await expect(page.getByRole('heading', { name: 'Secret diary' })).toBeVisible();
  await saved(page);
  await settings(page);
  await pin(page, '572914');
  await closeDialog(page);
  await page.locator('.topbar').getByRole('button', { name: 'Lock workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await unlock(page, '826193');
  await expect(page.getByRole('alert')).toBeVisible();
  await unlock(page, '572914');
  await settings(page);
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
  await expect(other.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
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
