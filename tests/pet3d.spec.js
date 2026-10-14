import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';

test.describe.configure({ mode: 'default' });
test.use({
  viewport: { width: 1500, height: 1000 },
  launchOptions: {
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  },
});
const runtimeErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  runtimeErrors.set(page, []);
  page.on('pageerror', (e) => runtimeErrors.get(page).push(e.message));
  await page.goto('/');
});
test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
});
const layer = (page) => page.locator('.pet3d-layer');
async function ready(page) {
  await expect(layer(page)).toHaveAttribute('data-ready', 'true', { timeout: 20000 });
  await expect(layer(page)).toHaveAttribute('data-grounded', 'true', { timeout: 10000 });
}
async function position(page, kind = 'cat') {
  return layer(page).evaluate(
    (e, kind) => ({ x: Number(e.dataset[`${kind}X`]), y: Number(e.dataset[`${kind}Y`]) }),
    kind,
  );
}

test('transparent WebGL scene replaces every 2D cat and leaves HTML controls interactive', async ({
  page,
}) => {
  await ready(page);
  await expect(page.locator('.cat-companion,.companion-layer,.cat-cursor-toy')).toHaveCount(0);
  await expect(page.locator('.pet3d-canvas canvas')).toHaveCSS('pointer-events', 'none');
  expect(Number(await layer(page).getAttribute('data-draw-calls'))).toBeLessThanOrEqual(16);
  expect(Number(await layer(page).getAttribute('data-triangles'))).toBeGreaterThan(5000);
  await page.mouse.move(1100, 600);
  await expect(page.locator('html')).toHaveAttribute('data-pet-cursor', 'true');
  await page.getByRole('button', { name: 'New entry', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(layer(page)).toHaveAttribute('data-paused', 'true');
  await expect(page.locator('html')).not.toHaveAttribute('data-pet-cursor');
  await page.getByLabel('Journal content').fill('Writing below a real 3D scene.');
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'New task', exact: true })
    .fill('HTML remains interactive');
  await page.getByRole('textbox', { name: 'New task', exact: true }).press('Enter');
  await expect(page.locator('.sticky-title')).toHaveText('HTML remains interactive');
});

test('keyboard pet and toy controls animate and move real physics bodies', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Pet 3D cat', exact: true }).click();
  await expect(layer(page)).toHaveAttribute('data-behavior', /roll|stretch/);
  const initial = await position(page, 'ball');
  await page.getByRole('button', { name: 'Toss toy ball', exact: true }).click();
  await expect
    .poll(async () =>
      Math.hypot(
        (await position(page, 'ball')).x - initial.x,
        (await position(page, 'ball')).y - initial.y,
      ),
    )
    .toBeGreaterThan(30);
  await expect(layer(page)).toHaveAttribute('data-behavior', /hunt|bat|run|crouch|jump|land/);
});

test('raycast cat dragging produces a toss, wall cling, and gravity-driven landing', async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(() => {
    window.petModes = [];
    new MutationObserver(() =>
      petModes.push(document.querySelector('.pet3d-layer').dataset.behavior),
    ).observe(document.querySelector('.pet3d-layer'), {
      attributes: true,
      attributeFilter: ['data-behavior'],
    });
  });
  const p = await position(page);
  await page.mouse.move(p.x, p.y - 5);
  await page.mouse.down();
  await expect(layer(page)).toHaveAttribute('data-behavior', 'drag');
  await page.mouse.move(p.x, 300, { steps: 10 });
  await page.mouse.move(410, 300, { steps: 6 });
  await expect.poll(async () => Math.abs((await position(page)).x - 410)).toBeLessThan(15);
  // Dispatch the final high-frequency flick together so software WebGL scheduling cannot turn it into a stopped drag.
  await page.evaluate(() => {
    for (const x of [390, 360, 340])
      document.documentElement.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          pointerId: 1,
          pointerType: 'mouse',
          clientX: x,
          clientY: 300,
          buttons: 1,
        }),
      );
    document.documentElement.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 1,
        pointerType: 'mouse',
        clientX: 340,
        clientY: 300,
        button: 0,
      }),
    );
  });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => petModes.includes('cling')), { timeout: 8000 })
    .toBe(true);
  await expect(layer(page)).toHaveAttribute('data-grounded', 'true', { timeout: 10000 });
  await expect(layer(page)).not.toHaveAttribute('data-behavior', 'cling');
  expect(Number(await layer(page).getAttribute('data-toss-speed'))).toBeGreaterThan(5);
});

test('idle cursor is held at the skeleton mouth while the cat roams and input instantly releases it', async ({
  page,
}) => {
  test.setTimeout(35000);
  await ready(page);
  await page.mouse.move(1050, 600);
  await expect(layer(page)).toHaveAttribute('data-holding-cursor', 'true', { timeout: 22000 });
  const before = await position(page);
  // No input: the hold survives the grab pose and subsequent autonomous decisions.
  await page.waitForTimeout(1700);
  await expect(layer(page)).toHaveAttribute('data-holding-cursor', 'true');
  expect(await layer(page).getAttribute('data-behavior')).not.toBe('grab');
  await page.mouse.move(1051, 600);
  await expect(layer(page)).toHaveAttribute('data-holding-cursor', 'false');
  await expect(page.locator('html')).toHaveAttribute('data-pet-cursor', 'true');
  await page.getByRole('button', { name: 'New entry', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-pet-cursor');
});

test('pause persists, reduced motion rests the cat, and viewport changes rebuild safe colliders', async ({
  page,
}) => {
  await ready(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(layer(page)).toHaveAttribute('data-reduced', 'true');
  await expect(page.locator('html')).not.toHaveAttribute('data-pet-cursor');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(layer(page)).toHaveAttribute('data-reduced', 'false');
  const closeNav = page.getByRole('button', { name: 'Close navigation' });
  if (await closeNav.isVisible()) await closeNav.click();
  await page.getByRole('button', { name: 'Pause cat companion' }).click();
  await expect(layer(page)).toHaveCount(0);
  await page.reload();
  await expect(layer(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume cat companion' }).click();
  await expect(layer(page)).toHaveAttribute('data-ready', 'true', { timeout: 20000 });
});

test('context loss immediately restores the native cursor and allows a clean retry', async ({
  page,
}) => {
  await ready(page);
  await page.mouse.move(1100, 600);
  await page
    .locator('.pet3d-canvas canvas')
    .evaluate((e) => e.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
  await expect(page.locator('html')).not.toHaveAttribute('data-pet-cursor');
  await expect(page.getByRole('button', { name: 'Retry 3D companion' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry 3D companion' }).click();
  await expect(layer(page)).toHaveAttribute('data-ready', 'true', { timeout: 20000 });
});

test('WebGL-unavailable devices keep a usable workspace and native cursor', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return String(type).startsWith('webgl') ? null : original.call(this, type, ...args);
    };
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Retry 3D companion' })).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-pet-cursor');
  await page.getByRole('button', { name: 'New entry', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('the toy ball is directly raycast-draggable and throwing it attracts the cat', async ({
  page,
}) => {
  await ready(page);
  // Catch the moving sphere on a fresh simulation frame, avoiding stale driver coordinates.
  await page.mouse.move(5, 5);
  await page.mouse.down();
  const p = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const root = document.querySelector('.pet3d-layer');
        const timeout = setTimeout(() => {
          observer.disconnect();
          reject(new Error('Could not raycast the moving ball'));
        }, 5000);
        const observer = new MutationObserver(() => {
          const x = Number(root.dataset.ballX),
            y = Number(root.dataset.ballY),
            target = document.elementFromPoint(x, y);
          if (!target) return;
          const init = {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType: 'mouse',
            clientX: x,
            clientY: y,
            button: 0,
            buttons: 1,
          };
          target.dispatchEvent(new PointerEvent('pointermove', init));
          const picked = !target.dispatchEvent(new PointerEvent('pointerdown', init));
          if (picked) {
            clearTimeout(timeout);
            observer.disconnect();
            resolve({ x, y });
          } else target.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
        });
        observer.observe(root, {
          attributes: true,
          attributeFilter: ['data-ball-x', 'data-ball-y'],
        });
      }),
  );
  await page.mouse.move(p.x, p.y);
  await expect(layer(page)).toHaveAttribute('data-dragging', 'ball');
  await page.mouse.move(p.x - 85, p.y - 90, { steps: 8 });
  await page.mouse.up();
  await expect(layer(page)).toHaveAttribute('data-dragging', 'none');
  await expect
    .poll(async () =>
      Math.hypot((await position(page, 'ball')).x - p.x, (await position(page, 'ball')).y - p.y),
    )
    .toBeGreaterThan(40);
  await expect(layer(page)).toHaveAttribute('data-behavior', /hunt|bat|run|jump|crouch|land/);
});

test('autonomous jumps crouch, launch under gravity, and land on a raycast UI surface', async ({
  page,
}) => {
  await ready(page);
  const initial = await position(page);
  await page.evaluate(() => {
    window.jumpModes = [];
    new MutationObserver(() =>
      jumpModes.push(document.querySelector('.pet3d-layer').dataset.behavior),
    ).observe(document.querySelector('.pet3d-layer'), {
      attributes: true,
      attributeFilter: ['data-behavior'],
    });
    // Choose the jump weight after resources exist, without duplicating Three object IDs at construction.
    window.originalPetRandom = Math.random;
    Math.random = () => 0.75;
  });
  try {
    await expect
      .poll(() => page.evaluate(() => jumpModes.includes('crouch')), { timeout: 9000 })
      .toBe(true);
    await expect
      .poll(() => page.evaluate(() => jumpModes.includes('jump')), { timeout: 6000 })
      .toBe(true);
    await expect
      .poll(() => page.evaluate(() => jumpModes.includes('land')), { timeout: 7000 })
      .toBe(true);
    await expect(layer(page)).toHaveAttribute('data-grounded', 'true');
    const final = await position(page);
    expect(final.y).toBeLessThan(initial.y - 30);
  } finally {
    await page.evaluate(() => {
      Math.random = originalPetRandom;
    });
  }
});

test('touch users can drag the cat without hijacking ordinary workspace scrolling', async ({
  browser,
  page: initialPage,
}) => {
  test.setTimeout(45000);
  await initialPage.close();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await page.goto('/');
    const nav = page.getByRole('button', { name: 'Close navigation' });
    if (await nav.isVisible()) await nav.click();
    await ready(page);
    const p = await position(page),
      scroll = await page.evaluate(() => scrollY);
    const client = await context.newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: p.x, y: p.y - 5 }],
    });
    await expect(layer(page)).toHaveAttribute('data-dragging', 'cat');
    for (let i = 1; i <= 6; i++)
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: p.x + (20 * i) / 6, y: p.y - 5 - (100 * i) / 6 }],
      });
    await expect.poll(async () => Math.abs((await position(page)).y - p.y)).toBeGreaterThan(40);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(layer(page)).toHaveAttribute('data-dragging', 'none');
    expect(await page.evaluate(() => scrollY)).toBe(scroll);
    await expect(page.locator('html')).not.toHaveAttribute('data-pet-cursor');
    // A normal touch scroll on an empty portion of the calendar remains available.
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 120, y: 700 }],
    });
    for (let i = 1; i <= 6; i++)
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 120, y: 700 - i * 35 }],
      });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(scroll);
  } finally {
    await context.close();
  }
});
