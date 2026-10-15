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
    (e, kind) => ({
      x: Number(e.dataset[kind === 'cat' ? 'catPickX' : `${kind}X`]),
      y: Number(e.dataset[kind === 'cat' ? 'catPickY' : `${kind}Y`]),
    }),
    kind,
  );
}

// Give jump/reaction tests an open roof. Spawn randomness and Three.js UUID
// allocation must not decide whether a physical hop has ceiling clearance.
async function placeOnCalendar(page) {
  const p = await position(page);
  const rect = await page.locator('.calendar-panel').boundingBox();
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await expect(layer(page)).toHaveAttribute('data-dragging', 'cat');
  await page.mouse.move(rect.x + rect.width / 2, rect.y - 35, { steps: 8 });
  // Simulate stopping the hand before releasing, beyond the 110ms throw window.
  await page.waitForTimeout(150);
  await page.mouse.up();
  await expect(layer(page)).toHaveAttribute('data-dragging', 'none');
  await expect(layer(page)).toHaveAttribute('data-grounded', 'true');
  await expect
    .poll(async () =>
      Math.abs(Number(await layer(page).getAttribute('data-cat-y')) - (rect.y - 17)),
    )
    .toBeLessThan(6);
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
  await expect(page.locator('html')).not.toHaveAttribute('data-pet-cursor');
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
  await expect(layer(page)).toHaveAttribute('data-behavior', 'purr');
  await page.getByRole('button', { name: 'Show play ball', exact: true }).click();
  await expect(layer(page)).toHaveAttribute('data-ball-visible', 'true');
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
  await page.mouse.move(110, 110, { steps: 6 });
  await expect.poll(async () => Math.abs((await position(page)).x - 110)).toBeLessThan(15);
  // Dispatch the final high-frequency flick together so software WebGL scheduling cannot turn it into a stopped drag.
  await page.evaluate(() => {
    for (const x of [90, 60, 35])
      document.documentElement.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          pointerId: 1,
          pointerType: 'mouse',
          clientX: x,
          clientY: 110,
          buttons: 1,
        }),
      );
    document.documentElement.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 1,
        pointerType: 'mouse',
        clientX: 35,
        clientY: 110,
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
  await placeOnCalendar(page);
  await page.mouse.move(1050, 600);
  await expect(layer(page)).toHaveAttribute('data-holding-cursor', 'true', { timeout: 22000 });
  expect(Number(await layer(page).getAttribute('data-capture-distance'))).toBeLessThanOrEqual(0.18);
  await expect(page.locator('html')).toHaveAttribute('data-pet-cursor', 'true');
  // No input: the hold survives the grab pose and subsequent autonomous decisions.
  await page.waitForTimeout(1700);
  await expect(layer(page)).toHaveAttribute('data-holding-cursor', 'true');
  expect(await layer(page).getAttribute('data-behavior')).not.toBe('grab');
  const revision = await layer(page).getAttribute('data-world-revision');
  await page.evaluate(() => scrollTo(0, 180));
  await page.waitForTimeout(250);
  await expect(layer(page)).toHaveAttribute('data-holding-cursor', 'true');
  const attachment = await layer(page).evaluate((e) =>
    Math.hypot(
      Number(e.dataset.cursorDocumentX) - Number(e.dataset.mouthDocumentX),
      Number(e.dataset.cursorDocumentY) - Number(e.dataset.mouthDocumentY),
    ),
  );
  expect(attachment).toBeLessThan(1);
  await expect(layer(page)).toHaveAttribute('data-world-revision', revision);
  await page.evaluate(() => scrollTo(0, 0));
  await page.mouse.move(1051, 600);
  await expect(layer(page)).toHaveAttribute('data-holding-cursor', 'false');
  await expect(page.locator('html')).not.toHaveAttribute('data-pet-cursor');
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
  await page.getByRole('button', { name: 'Show play ball', exact: true }).click();
  await expect(layer(page)).toHaveAttribute('data-ball-visible', 'true');
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
  await expect(layer(page)).toHaveAttribute(
    'data-behavior',
    /hunt|bat|run|carry|descend|jump|crouch|land|climb/,
  );
});

test('autonomous jumps crouch, launch under gravity, and land on a raycast UI surface', async ({
  page,
}) => {
  test.setTimeout(35000);
  await page.addInitScript(() => {
    let seed = 1977;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  });
  await page.reload();
  await ready(page);
  await placeOnCalendar(page);
  await page.evaluate(() => {
    window.jumpModes = [];
    // Several fixed physics steps can run before a DOM observer callback.
    // Keep each mutation's old value as well as the final state, so a real
    // landing is still observed when the next behavior begins in the same batch.
    new MutationObserver((records) =>
      jumpModes.push(
        ...records.map((record) => record.oldValue),
        document.querySelector('.pet3d-layer').dataset.behavior,
      ),
    ).observe(document.querySelector('.pet3d-layer'), {
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['data-behavior'],
    });
    // Choose the jump weight after resources exist, without duplicating Three object IDs at construction.
    window.originalPetRandom = Math.random;
    Math.random = () => 0.77;
  });
  try {
    await expect
      .poll(() => page.evaluate(() => jumpModes.includes('crouch')), { timeout: 16000 })
      .toBe(true);
    await expect
      .poll(() => page.evaluate(() => jumpModes.includes('jump')), { timeout: 6000 })
      .toBe(true);
    await expect
      .poll(() => page.evaluate(() => jumpModes.includes('land')), { timeout: 7000 })
      .toBe(true);
    await expect(layer(page)).toHaveAttribute('data-grounded', 'true');
    expect(Number(await layer(page).getAttribute('data-cat-document-y'))).toBeGreaterThan(0);
    expect(Number(await layer(page).getAttribute('data-cat-document-y'))).toBeLessThan(
      await page.locator('.pet3d-host').evaluate((e) => e.clientHeight),
    );
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

test('miniature cat and ball keep document positions while the canvas scrolls offscreen and returns', async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(() => {
    const key = 'still-workspace-v2',
      saved = JSON.parse(localStorage.getItem(key));
    saved.data.spaces[0].notes = Array.from({ length: 72 }, (_, i) => ({
      id: `scroll-note-${i}`,
      title: `Journal moment ${i}`,
      body: 'A real document surface below the fold.',
      date: null,
      emoji: '',
      folder: null,
      mood: '',
      updatedAt: new Date().toISOString(),
    }));
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.reload();
  await ready(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(layer(page)).toHaveAttribute('data-reduced', 'true');
  const snapshot = () =>
    layer(page).evaluate((root) => ({
      catX: root.dataset.catDocumentX,
      catY: root.dataset.catDocumentY,
      ballX: root.dataset.ballDocumentX,
      ballY: root.dataset.ballDocumentY,
      revision: root.dataset.worldRevision,
      height: Number(root.dataset.standingHeight),
      layerTop: root.getBoundingClientRect().top,
      rasterHeight: root.querySelector('.pet3d-canvas').getBoundingClientRect().height,
      parent: root.parentElement.classList.contains('pet3d-host'),
      position: getComputedStyle(root).position,
    }));
  const before = await snapshot();
  expect(before.parent).toBe(true);
  expect(before.position).toBe('absolute');
  expect(before.height).toBeCloseTo(45, 1);
  expect(before.height).toBeGreaterThan(25);
  expect(before.rasterHeight).toBeLessThanOrEqual(2048);
  await page.evaluate(() => scrollTo(0, 1800));
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(1500);
  await page.waitForTimeout(350);
  const scrolled = await snapshot();
  expect(scrolled.layerTop).toBeLessThan(before.layerTop - 1500);
  expect(scrolled.catX).toBe(before.catX);
  expect(scrolled.catY).toBe(before.catY);
  expect(scrolled.ballX).toBe(before.ballX);
  expect(scrolled.ballY).toBe(before.ballY);
  expect(scrolled.revision).toBe(before.revision);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(350);
  const back = await snapshot();
  expect(back.catY).toBe(before.catY);
  expect(back.layerTop).toBe(before.layerTop);
});

test('raycasting remains aligned with the tiny kitten after scrolling', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => scrollTo(0, 220));
  await page.waitForTimeout(300);
  const p = await position(page);
  await page.mouse.move(p.x, p.y - 3);
  await page.mouse.down();
  await expect(layer(page)).toHaveAttribute('data-dragging', 'cat');
  await page.mouse.move(p.x + 35, p.y - 45, { steps: 8 });
  await page.mouse.up();
  await expect(layer(page)).toHaveAttribute('data-dragging', 'none');
  await expect(layer(page)).toHaveAttribute('data-grounded', 'true', { timeout: 10000 });
});

test('top-right ball control starts off, persists independently, and supports ball-only play', async ({
  page,
}) => {
  await ready(page);
  await expect(page.getByRole('button', { name: 'Show play ball' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(layer(page)).toHaveAttribute('data-ball-visible', 'false');
  await expect(page.getByRole('button', { name: 'Toss toy ball' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show play ball' }).click();
  await expect(layer(page)).toHaveAttribute('data-ball-visible', 'true');
  await page.getByRole('button', { name: 'Pause cat companion' }).click();
  await expect(layer(page)).toHaveAttribute('data-cat-enabled', 'false');
  await page.getByRole('button', { name: 'Toss toy ball' }).click();
  const before = await position(page, 'ball');
  await expect
    .poll(async () =>
      Math.hypot(
        (await position(page, 'ball')).x - before.x,
        (await position(page, 'ball')).y - before.y,
      ),
    )
    .toBeGreaterThan(10);
  await page.mouse.move(1000, 600);
  await expect(page.locator('html')).not.toHaveAttribute('data-pet-cursor');
  await page.reload();
  await expect(layer(page)).toHaveAttribute('data-ready', 'true', { timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Resume cat companion' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.getByRole('button', { name: 'Hide play ball' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Hide play ball' }).click();
  await expect(layer(page)).toHaveCount(0);
});

test('clicking the actual kitten cycles through four reactions and speech bubbles', async ({
  page,
}) => {
  await ready(page);
  await placeOnCalendar(page);
  await page.evaluate(() => {
    window.clickModes = [];
    new MutationObserver((records) => {
      clickModes.push(
        ...records.map((record) => record.oldValue),
        document.querySelector('.pet3d-layer').dataset.behavior,
      );
    }).observe(document.querySelector('.pet3d-layer'), {
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['data-behavior'],
    });
  });
  for (const [index, mode] of ['purr', 'bat', 'head-tilt', 'jump'].entries()) {
    await page.evaluate(() => {
      clickModes.length = 0;
    });
    const p = await position(page);
    await page.mouse.click(p.x, p.y);
    await expect(layer(page)).toHaveAttribute('data-reaction-count', String(index + 1));
    await expect
      .poll(() => page.evaluate((expected) => clickModes.includes(expected), mode))
      .toBe(true);
    await expect(page.locator('.pet3d-bubble')).toBeVisible();
  }
});

test('text scratching and letter carrying preserve React text, accessible labels, and saved data', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('button', { name: 'New entry', exact: true }).click();
  await page.getByLabel('Entry title').fill('A sanctuary for 🐈 and café thoughts');
  await page.getByLabel('Journal content').fill('The cat must leave my writing intact.');
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  const result = await page.evaluate(async () => {
    const { collectTextTargets, createTextMischief } =
      await import('/src/lib/pet3d/textMischief.js');
    const host = document.querySelector('.pet3d-host'),
      input = { reduced: false, paused: false, stolenLetter: null };
    const targets = collectTextTargets(host, (x, y) => ({ x, y }));
    const target = targets.find((t) => t.node.textContent.includes('café thoughts'));
    const saved = localStorage.getItem('still-workspace-v2'),
      original = target.node.textContent;
    const engine = createTextMischief(host, input);
    const scratched = engine.scratch(target),
      stolen = engine.steal(target, () => 0.4);
    const before = {
      scratched,
      stolen,
      letter: input.stolenLetter,
      highlight: CSS.highlights.has('still-cat-letter'),
      text: target.node.textContent,
      original,
      savedUnchanged: saved === localStorage.getItem('still-workspace-v2'),
    };
    engine.dispose();
    return {
      ...before,
      healed:
        !CSS.highlights.has('still-cat-letter') &&
        !CSS.highlights.has('still-cat-scratch') &&
        !target.element.hasAttribute('data-pet-scratched'),
      textAfter: target.node.textContent,
      count: targets.length,
    };
  });
  expect(result.scratched).toBe(true);
  expect(result.stolen).toBe(true);
  expect(result.highlight).toBe(true);
  expect(result.letter).toMatch(/[\p{L}\p{N}]/u);
  expect(result.text).toBe(result.original);
  expect(result.textAfter).toBe(result.original);
  expect(result.savedUnchanged).toBe(true);
  expect(result.healed).toBe(true);
  expect(result.count).toBeGreaterThan(30);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'A sanctuary for 🐈 and café thoughts', exact: true }),
  ).toBeVisible();
});

test('the bundled tabby uses authored clips and exposes complete credits in Settings', async ({
  page,
}) => {
  await ready(page);
  await expect(layer(page)).toHaveAttribute('data-animation-count', '12');
  await expect(layer(page)).toHaveAttribute('data-standing-height', '45');
  await page.getByRole('button', { name: 'Open settings', exact: true }).first().click();
  await page.getByText('About & credits', { exact: true }).click();
  const credits = page.locator('.companion-credits');
  await expect(credits).toContainText('Animal Animator');
  await expect(credits).toContainText('Micael Martins');
  await expect(credits).toContainText('transferred skin weights');
  await expect(credits.getByRole('link', { name: 'CC BY 4.0', exact: true })).toHaveAttribute(
    'href',
    'https://creativecommons.org/licenses/by/4.0/',
  );
  await expect(
    credits.getByRole('link', { name: 'Sketchfab Standard License', exact: true }),
  ).toHaveAttribute('href', 'https://sketchfab.com/licenses');
});

test('a failed model download preserves the workspace and can be retried', async ({ page }) => {
  await page.route('**/models/still-tabby.v1.glb', (route) => route.abort());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Retry 3D companion', exact: true })).toBeVisible({
    timeout: 20000,
  });
  await page.mouse.move(1000, 400);
  await expect(page.locator('html')).not.toHaveAttribute('data-pet-cursor');
  await page.getByRole('button', { name: 'New entry', exact: true }).click();
  await page.getByLabel('Journal content').fill('My writing survives an unavailable cat asset.');
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await expect(page.locator('.entry-card')).toContainText(
    'My writing survives an unavailable cat asset.',
  );
  await page.unroute('**/models/still-tabby.v1.glb');
  await page.getByRole('button', { name: 'Retry 3D companion', exact: true }).click();
  await ready(page);
  await expect(layer(page)).toHaveAttribute('data-animation-count', '12');
});

test('feline arbitration runs in a worker and gracefully falls back when workers are blocked', async ({
  page,
}) => {
  await ready(page);
  await expect(layer(page)).toHaveAttribute('data-brain', 'worker');
  await page.addInitScript(() => {
    window.Worker = class {
      constructor() {
        throw new Error('Worker unavailable in this test environment');
      }
    };
  });
  await page.reload();
  await ready(page);
  await expect(layer(page)).toHaveAttribute('data-brain', 'main');
  await page.mouse.move(900, 400);
  await expect(page.locator('html')).not.toHaveAttribute('data-pet-cursor');
  await page.getByRole('button', { name: 'New entry', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('spatial mapping ignores transparent padding and uses only the painted divider edge', async ({
  page,
}) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const { observeDomWorld } = await import('/src/lib/pet3d/domWorld.js');
    const host = document.querySelector('.pet3d-host');
    const ghost = document.createElement('div'),
      line = document.createElement('div');
    for (const el of [ghost, line]) {
      el.dataset.catSurface = 'panel';
      el.style.cssText =
        'position:absolute;top:250px;left:600px;width:240px;height:80px;background:transparent;border:0;pointer-events:none';
      host.append(el);
    }
    line.style.borderRight = '2px solid rgb(255, 200, 90)';
    let stop;
    const measured = await new Promise((resolve) => {
      stop = observeDomWorld(host, resolve);
    });
    stop();
    const id = [...measured.elementsById].find(([id, el]) => el === line)?.[0];
    const result = {
      ghost: [...measured.elementsById.values()].includes(ghost),
      edges: measured.boxes.filter((b) => b.id.startsWith(id)).map((b) => b.id.slice(id.length)),
    };
    ghost.remove();
    line.remove();
    return result;
  });
  expect(result.ghost).toBe(false);
  expect(result.edges).toEqual(['-right']);
});

test('nearest-grapheme theft heals after its hold window and queues a decorative 3D release', async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(async () => {
    const { collectTextTargets, createTextMischief } =
      await import('/src/lib/pet3d/textMischief.js');
    const host = document.querySelector('.pet3d-host'),
      el = document.createElement('span');
    el.textContent = 'AB🐈CD';
    el.style.cssText =
      'position:absolute;left:600px;top:350px;font:32px system-ui;pointer-events:none';
    host.append(el);
    const target = collectTextTargets(host, (x, y) => ({ x: x / 40, y: -y / 40 })).find(
      (t) => t.node === el.firstChild,
    );
    const r = document.createRange();
    r.setStart(el.firstChild, 1);
    r.setEnd(el.firstChild, 2);
    const rect = r.getBoundingClientRect(),
      origin = host.getBoundingClientRect();
    const mouth = {
      x: (rect.left - origin.left + rect.width / 2) / 40,
      y: -(rect.top - origin.top + rect.height / 2) / 40,
    };
    const input = { reduced: false, paused: false, stolenLetter: null, mouth },
      engine = createTextMischief(host, input);
    window.theft = { input, engine, el, saved: localStorage.getItem('still-workspace-v2') };
    engine.steal(target, () => 0, mouth);
  });
  expect(await page.evaluate(() => theft.input.stolenLetter)).toBe('B');
  expect(await page.evaluate(() => theft.el.textContent)).toBe('AB🐈CD');
  await expect
    .poll(() => page.evaluate(() => theft.input.stolenLetter), { timeout: 6500 })
    .toBe(null);
  const after = await page.evaluate(() => {
    const result = {
      release: theft.input.letterRelease?.text,
      text: theft.el.textContent,
      same: theft.saved === localStorage.getItem('still-workspace-v2'),
      highlight: CSS.highlights.has('still-cat-letter'),
    };
    theft.engine.dispose();
    theft.el.remove();
    return result;
  });
  expect(after).toEqual({ release: 'B', text: 'AB🐈CD', same: true, highlight: false });
});
