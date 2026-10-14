import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.clock.install({ time: new Date(2026, 9, 15, 12) });
  await page.addInitScript(() => {
    let seed = 19586;
    Math.random = () => (seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296;
  });
  await page.goto('/');
});

async function switchSpace(page, name) {
  await page.getByRole('button', { name: /^Switch workspace/ }).click();
  await page.getByRole('menuitemradio', { name: new RegExp(name) }).click();
}

test('weighted decisions produce varied life without changing collection text', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    let seed = 734;
    Math.random = () => (seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296;
  });
  await page.reload();
  await page.getByRole('button', { name: 'Add folder', exact: true }).click();
  await page.getByLabel('Collection name').fill('Quiet ideas');
  await page.getByRole('button', { name: 'Save collection', exact: true }).click();
  await page.mouse.move(-2, -2);
  await expect(page.locator('.cat-companion')).toBeVisible();
  await page.evaluate(() => {
    window.catStates = [];
    window.scratchSeen = false;
    const cat = document.querySelector('.cat-companion');
    new MutationObserver(() => catStates.push({ ...cat.dataset })).observe(cat, {
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
  await page.clock.runFor(120000);
  const result = await page.evaluate(() => ({
    states: [...new Set(catStates.map((s) => s.behavior))],
    decisions: [...new Set(catStates.map((s) => s.decision))],
    scratch: scratchSeen,
    text: document.querySelector('.folder-name > span:last-child').textContent,
  }));
  expect(result.decisions.length).toBeGreaterThanOrEqual(7);
  expect(result.states.length).toBeGreaterThanOrEqual(6);
  expect(result.states.some((s) => ['prowling', 'pouncing'].includes(s))).toBe(true);
  expect(result.states.some((s) => ['sleeping', 'stretching', 'rolling'].includes(s))).toBe(true);
  expect(result.text).toBe('Quiet ideas');
  // An active scratch may legitimately be underway at any random sample; pause must restore it.
  await page.getByRole('button', { name: 'Pause cat companion' }).click();
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
  await expect(page.locator('.light-parallax')).not.toHaveAttribute('style', /translate3d/);
  const resting = await page
    .locator('.cat-companion')
    .evaluate((element) => element.style.transform);
  await page.clock.runFor(2000);
  expect(await page.locator('.cat-companion').evaluate((element) => element.style.transform)).toBe(
    resting,
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('.cat-companion')).not.toHaveAttribute('data-resting', 'true');
  await expect(page.locator('.cat-companion')).not.toHaveAttribute('data-resting', 'true');
  await page.clock.runFor(4000);
  await expect(page.locator('.companion-tail')).not.toHaveCSS('animation-name', 'none');
});

async function watchCursorGame(page) {
  await page.evaluate(() => {
    window.petEvents = [];
    const cat = document.querySelector('.cat-companion');
    new MutationObserver(() =>
      petEvents.push({ ...cat.dataset, ghost: !document.querySelector('.cat-cursor-toy').hidden }),
    ).observe(cat, {
      attributes: true,
      attributeFilter: ['data-behavior', 'data-chirping'],
    });
  });
}

async function findGrab(page) {
  // Bounded polling using the fake browser clock, including a safe landing if initially airborne.
  for (let i = 0; i < 100; i++) {
    await page.clock.runFor(200);
    if (await page.locator('html').getAttribute('data-cat-cursor-hidden')) return;
  }
  throw new Error('The idle cursor was never grabbed');
}

test('idle cursor is stalked, visually carried, released with a chirp, and never changes click coordinates', async ({
  page,
}) => {
  await expect(page.locator('.cat-companion')).toBeVisible();
  await watchCursorGame(page);
  await page.mouse.move(1000, 620);
  await page.clock.runFor(5900);
  await expect(page.locator('html')).not.toHaveAttribute('data-cat-cursor-hidden');
  await findGrab(page);
  await expect(page.locator('.cat-companion')).toHaveAttribute('data-target-x', '1000');
  await expect(page.locator('.cat-companion')).toHaveAttribute('data-target-y', '620');
  await expect(page.locator('.cat-cursor-toy')).toBeVisible();
  expect(
    await page.locator('.cat-cursor-toy').evaluate((e) => getComputedStyle(e).pointerEvents),
  ).toBe('none');
  await page.clock.runFor(6500);
  await expect(page.locator('html')).not.toHaveAttribute('data-cat-cursor-hidden');
  await expect(page.locator('.cat-cursor-toy')).toBeHidden();
  const events = await page.evaluate(() => petEvents);
  for (const behavior of ['stalking', 'pounce-ready', 'grabbing', 'batting'])
    expect(events.map((e) => e.behavior)).toContain(behavior);
  expect(events.some((e) => e.chirping === 'true')).toBe(true);
  await page.getByRole('button', { name: 'Next month' }).click();
  await expect(page.locator('.calendar-controls h2')).toHaveText('November 2026');
});

test('mouse movement, keyboard activity, dialogs and unmount always restore the cursor', async ({
  page,
}) => {
  await expect(page.locator('.cat-companion')).toBeVisible();
  for (const action of ['move', 'key', 'dialog', 'pause']) {
    await page.mouse.move(1050, 600);
    await findGrab(page);
    if (action === 'move') await page.mouse.move(1051, 600);
    if (action === 'key') await page.keyboard.press('Shift');
    if (action === 'dialog')
      await page.getByRole('button', { name: 'New entry', exact: true }).click();
    if (action === 'pause') await page.getByRole('button', { name: 'Pause cat companion' }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-cat-cursor-hidden');
    await expect(page.locator('.cat-cursor-toy')).toBeHidden();
    if (action === 'dialog') await page.getByRole('button', { name: 'Close dialog' }).click();
  }
});

test('slow nearby pointer movement tracks the head and nearby clicks trigger a reaction', async ({
  page,
}) => {
  const cat = page.locator('.cat-companion');
  await expect(cat).toBeVisible();
  await page.clock.runFor(350);
  const box = await cat.boundingBox();
  const x = box.x + box.width / 2 + 75,
    y = box.y + 24;
  await page.mouse.move(x - 4, y);
  await page.clock.runFor(40);
  await page.mouse.move(x, y);
  await page.clock.runFor(50);
  expect(await cat.evaluate((e) => e.style.getPropertyValue('--cat-look-x'))).not.toBe('0px');
  await page.mouse.click(x, y);
  await expect(cat).toHaveAttribute('data-reaction', /startled|tail-flick|stretching/);
});

test('typing and dragging suppress cursor games, and reduced motion cancels an active grab', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'New entry', exact: true }).click();
  await page.getByLabel('Journal content').fill('Writing without interruption.');
  await page.mouse.move(800, 500);
  await page.clock.runFor(12000);
  await expect(page.locator('html')).not.toHaveAttribute('data-cat-cursor-hidden');
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.mouse.move(1000, 600);
  await page.mouse.down();
  await page.clock.runFor(12000);
  await expect(page.locator('html')).not.toHaveAttribute('data-cat-cursor-hidden');
  await page.mouse.up();
  await findGrab(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.cat-companion')).toHaveAttribute('data-resting', 'true');
  await expect(page.locator('html')).not.toHaveAttribute('data-cat-cursor-hidden');
  await expect(page.locator('.cat-cursor-toy')).toBeHidden();
});

test('reachable collection perches scratch visually and cleanup restores text and cursor', async ({
  page,
}) => {
  // A spacious fixture verifies the collision contract. Dense real layouts can legitimately reject a route.
  const markup = await page.locator('.companion-layer').evaluate((e) => e.outerHTML);
  await page.getByRole('button', { name: 'Pause cat companion' }).click();
  await page.evaluate(async (markup) => {
    document.getElementById('root').style.display = 'none';
    const fixture = document.createElement('div');
    fixture.innerHTML = `<section data-cat-surface="calendar" class="calendar-panel" style="position:fixed;left:100px;top:400px;width:500px;height:150px"></section>
      <div class="folder-row" data-cat-surface="collection" style="position:fixed;left:680px;top:400px;width:300px;height:50px"><span class="folder-name"><span>🌿</span><span>Quiet ideas</span></span></div>${markup}`;
    document.body.append(fixture);
    const { createCompanionController } = await import('/src/lib/motion/companionController.js');
    window.fixturePet = createCompanionController(fixture.querySelector('.cat-companion'), {
      random: () => 0.78,
    });
    window.fixtureStates = [];
    window.fixtureScratch = false;
    new MutationObserver(() => {
      fixtureStates.push(fixture.querySelector('.cat-companion').dataset.behavior);
      if (fixture.querySelector('[data-cat-scratched]')) fixtureScratch = true;
    }).observe(fixture, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-behavior', 'data-cat-scratched'],
    });
  }, markup);
  await page.clock.runFor(15000);
  const result = await page.evaluate(() => ({ states: fixtureStates, scratch: fixtureScratch }));
  expect(result.states).toContain('scratching');
  expect(result.scratch).toBe(true);
  await expect(page.locator('.folder-name > span:last-child').last()).toHaveText('Quiet ideas');
  await page.evaluate(() => fixturePet.destroy());
  const stopped = await page.locator('.cat-companion').getAttribute('style');
  await page.mouse.move(800, 300);
  await page.clock.runFor(10000);
  expect(await page.locator('.cat-companion').getAttribute('style')).toBe(stopped);
  await expect(page.locator('[data-cat-scratched]')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-cat-cursor-hidden');
});

test('unrelated DOM updates preserve mouse inactivity and do not restart the pet', async ({
  page,
}) => {
  await expect(page.locator('.cat-companion')).toBeVisible();
  await watchCursorGame(page);
  await page.mouse.move(1100, 610);
  await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.id = 'activity-probe';
    probe.hidden = true;
    probe.textContent = '0';
    document.querySelector('.page-footer').append(probe);
  });
  for (let i = 0; i < 40; i++) {
    await page.clock.runFor(250);
    await page.evaluate((i) => {
      document.getElementById('activity-probe').firstChild.data = String(i);
    }, i);
  }
  expect(await page.evaluate(() => petEvents.some((e) => e.decision === 'target-cursor'))).toBe(
    true,
  );
  await page.mouse.move(1101, 610);
  await expect(page.locator('html')).not.toHaveAttribute('data-cat-cursor-hidden');
});
