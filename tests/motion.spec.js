import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.clock.install({ time: new Date(2026, 9, 15, 12) });
  await page.goto('/');
});

async function switchSpace(page, name) {
  await page.getByRole('button', { name: /^Switch workspace/ }).click();
  await page.getByRole('menuitemradio', { name: new RegExp(name) }).click();
}

test('cat cycles through physical behaviors, scratches visually, and restores the collection text', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Add folder', exact: true }).click();
  await page.getByLabel('Collection name').fill('Quiet ideas');
  await page.getByRole('button', { name: 'Save collection', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pet the cat companion' })).toBeVisible();
  await page.evaluate(() => {
    window.catStates = [];
    window.scratchSeen = false;
    const cat = document.querySelector('.cat-companion');
    new MutationObserver(() => catStates.push(cat.dataset.behavior)).observe(cat, {
      attributes: true,
      attributeFilter: ['data-behavior'],
    });
    new MutationObserver((records) => {
      if (records.some((record) => record.target.hasAttribute('data-cat-scratched')))
        scratchSeen = true;
    }).observe(document.querySelector('.folder-tree'), {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-cat-scratched'],
    });
  });
  await page.clock.runFor(36000);
  const result = await page.evaluate(() => ({
    states: [...new Set(catStates)],
    scratch: scratchSeen,
    text: document.querySelector('.folder-name > span:last-child').textContent,
  }));
  for (const behavior of [
    'running',
    'rolling',
    'playing',
    'sleeping',
    'jumping',
    'climbing',
    'scratching',
  ])
    expect(result.states).toContain(behavior);
  expect(result.scratch).toBe(true);
  expect(result.text).toBe('Quiet ideas');
  await expect(page.locator('[data-cat-scratched]')).toHaveCount(0);
});

test('pet, pause and persisted resume controls work and dialogs suspend the companion', async ({
  page,
}) => {
  const cat = page.getByRole('button', { name: 'Pet the cat companion' });
  await expect(cat).toBeVisible();
  await cat.click();
  await expect(cat).toHaveAttribute('data-behavior', 'rolling');
  await page.getByRole('button', { name: 'Pause cat companion' }).click();
  await expect(cat).toHaveCount(0);
  await page.reload();
  await expect(cat).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume cat companion' }).click();
  await expect(cat).toBeVisible();
  await page.getByRole('button', { name: 'New entry', exact: true }).click();
  await expect(cat).toBeHidden();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(cat).toBeVisible();
});

test('cat stays on visible surfaces through scroll, collapse and narrow layouts', async ({
  page,
}) => {
  await expect(page.locator('.cat-companion')).toBeVisible();
  await page.clock.runFor(1200);
  for (const width of [1600, 900, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.runFor(350);
    const rect = await page.locator('.cat-companion').boundingBox();
    if (rect) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(width);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.y + rect.height).toBeLessThanOrEqual(900);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.clock.runFor(350);
  await page.evaluate(() => scrollTo(0, 500));
  await page.clock.runFor(350);
  const rect = await page.locator('.cat-companion').boundingBox();
  if (rect) expect(rect.y).toBeGreaterThanOrEqual(0);
});

test('workspace themes transition, apply to portals, and cursor lighting uses transforms', async ({
  page,
}) => {
  await expect(page.locator('html')).toHaveAttribute('data-workspace-theme', 'personal');
  expect(await page.locator('.journal-atmosphere .ambient-mote').count()).toBe(44);
  const original = await page
    .locator('.light-parallax')
    .evaluate((element) => getComputedStyle(element).transform);
  await page.mouse.move(1500, 800);
  await page.clock.runFor(1000);
  expect(
    await page
      .locator('.light-parallax')
      .evaluate((element) => getComputedStyle(element).transform),
  ).not.toBe(original);
  const personal = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--space-button'),
  );
  await switchSpace(page, 'Work');
  await expect(page.locator('html')).toHaveAttribute('data-workspace-theme', 'work');
  const work = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--space-button'),
  );
  expect(work).not.toBe(personal);
  await page.getByRole('button', { name: 'New entry', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(
    await page.getByRole('dialog').evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe('rgb(24, 33, 57)');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-workspace-theme', 'work');
});

test('reduced motion keeps the cat resting and disables ambient movement', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('.cat-companion')).toHaveAttribute('data-resting', 'true');
  const before = await page
    .locator('.cat-companion')
    .evaluate((element) => element.style.transform);
  await page.clock.runFor(15000);
  expect(await page.locator('.cat-companion').evaluate((element) => element.style.transform)).toBe(
    before,
  );
  expect(
    await page
      .locator('.ambient-mote')
      .first()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none');
  expect(
    await page
      .locator('.companion-tail')
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none');
});

test('hidden tabs suspend the engine and resume without a large animation jump', async ({
  page,
}) => {
  await expect(page.locator('.cat-companion')).toBeVisible();
  await page.evaluate(() => {
    window.testHidden = true;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.testHidden });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('.cat-companion')).toBeHidden();
  expect(
    await page
      .locator('.ambient-mote')
      .first()
      .evaluate((element) => getComputedStyle(element).animationPlayState),
  ).toBe('paused');
  await page.clock.runFor(10000);
  await page.evaluate(() => {
    window.testHidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('.cat-companion')).toBeVisible();
  const box = await page.locator('.cat-companion').boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(1000);
});

test('changing reduced motion live stops and restarts the companion without a reload', async ({
  page,
}) => {
  await expect(page.locator('.cat-companion')).toBeVisible();
  await page.mouse.move(1450, 700);
  await page.clock.runFor(500);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.cat-companion')).toHaveAttribute('data-resting', 'true');
  expect(await page.locator('.light-parallax').evaluate((element) => element.style.transform)).toBe(
    '',
  );
  const resting = await page
    .locator('.cat-companion')
    .evaluate((element) => element.style.transform);
  await page.clock.runFor(2000);
  expect(await page.locator('.cat-companion').evaluate((element) => element.style.transform)).toBe(
    resting,
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('.cat-companion')).not.toHaveAttribute('data-resting', 'true');
  await page.clock.runFor(1400);
  expect(
    await page.locator('.cat-companion').evaluate((element) => element.style.transform),
  ).not.toBe(resting);
});
