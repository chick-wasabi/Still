import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
test.use({
  viewport: { width: 1500, height: 1000 },
  launchOptions: {
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  },
});
test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => {
    throw e;
  });
  await page.goto('/?petDebug=1');
  await expect(page.locator('.pet3d-layer')).toHaveAttribute('data-ready', 'true', {
    timeout: 30000,
  });
});
const layer = (page) => page.locator('.pet3d-layer');

test('sitting and the seated loaf transition stay grounded on the New entry button', async ({
  page,
}) => {
  test.setTimeout(45000);
  await page.getByLabel('Preview cat pose').selectOption('sit');
  const id = await page.evaluate(() => {
    const d = document.querySelector('.pet3d-layer').__petDebug;
    const surface = d.layout.current.surfaces.find((s) => s.kind === 'button');
    d.cat.setTranslation(
      { x: (surface.left + surface.right) / 2, y: surface.top + 0.435, z: 0 },
      true,
    );
    d.cat.setLinvel({ x: 0, y: 0, z: 0 }, true);
    return surface.id;
  });
  await expect(layer(page)).toHaveAttribute('data-support-id', id);
  await page.getByLabel('Surface and paw overlays').uncheck();
  await page.getByText('Cat motion lab · development', { exact: true }).click();
  const contacts = () =>
    page.evaluate(async () => {
      const { Vector3 } = await import('/node_modules/.vite/deps/three.js');
      const d = document.querySelector('.pet3d-layer').__petDebug,
        s = d.model.skins[1],
        v = new Vector3();
      const low = [Infinity, Infinity, Infinity],
        weights = s.geometry.attributes.skinWeight,
        indices = s.geometry.attributes.skinIndex;
      for (let i = 0; i < weights.count; i++) {
        let dominant = '',
          largest = -1;
        const front = [0, 0];
        for (let k = 0; k < 4; k++) {
          const w = weights.getComponent(i, k),
            name = s.skeleton.bones[indices.getComponent(i, k)].name;
          if (w > largest) {
            largest = w;
            dominant = name;
          }
          if (/hand|f_digit/.test(name)) front[name.includes('L_') ? 0 : 1] += w;
        }
        v.fromBufferAttribute(s.geometry.attributes.position, i);
        s.applyBoneTransform(i, v).applyMatrix4(s.matrixWorld);
        front.forEach((w, f) => {
          if (w > 0.6) low[f] = Math.min(low[f], v.y);
        });
        if (dominant.startsWith('thigh')) low[2] = Math.min(low[2], v.y);
      }
      return low.map((y) => (y - d.input.support.top) * 40);
    });
  // Wait for the pose blend itself, rather than assuming software WebGL has
  // rendered its full 0.5 seconds within a fixed wall-clock delay.
  await expect
    .poll(async () => Math.max(...(await contacts()).map(Math.abs)), { timeout: 8000 })
    .toBeLessThan(0.75);
  await page.screenshot({ path: '/tmp/still-seated-button-fixed.png' });
  await page.evaluate(() => {
    const d = document.querySelector('.pet3d-layer').__petDebug;
    d.input.debugPose = 'lie-down';
    d.input.debugTime = 0;
  });
  await page.waitForTimeout(700);
  await expect(layer(page)).toHaveAttribute('data-animation-clip', 'Still_Lie_Down_From_Sit');
  for (const time of [0.45, 0.8, 1.25, 1.8]) {
    await page.evaluate(
      (time) => (document.querySelector('.pet3d-layer').__petDebug.input.debugTime = time),
      time,
    );
    await page.waitForTimeout(350);
  }
  const error = await page.evaluate(async () => {
    const { Box3 } = await import('/node_modules/.vite/deps/three.js');
    const d = document.querySelector('.pet3d-layer').__petDebug,
      box = new Box3();
    d.model.skins.forEach((s) => box.union(new Box3().setFromObject(s, true)));
    return (box.min.y - d.input.support.top) * 40;
  });
  expect(Math.abs(error)).toBeLessThan(0.75);
  await page.screenshot({ path: '/tmp/still-loaf-button-fixed.png' });
});

test('animated companion text never rescans the workspace DOM', async ({ page }) => {
  const scans = await page.evaluate(async () => {
    const original = document.createTreeWalker.bind(document),
      host = document.querySelector('.pet3d-host');
    let count = 0;
    document.createTreeWalker = (...args) => {
      if (args[0] === host) count++;
      return original(...args);
    };
    try {
      const bubble = document.querySelector('.pet3d-bubble');
      for (let i = 0; i < 6; i++) {
        bubble.textContent = 'purr ' + i;
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      return count;
    } finally {
      document.createTreeWalker = original;
    }
  });
  expect(scans).toBeLessThanOrEqual(1);
});

test('actual comfort skins stay on the same painted support across pose changes', async ({
  page,
}) => {
  await page.getByLabel('Preview cat pose').selectOption('idle');
  await page.evaluate(() => {
    const d = document.querySelector('.pet3d-layer').__petDebug;
    const roof = d.layout.current.surfaces.find((s) => s.kind === 'calendar');
    d.cat.setTranslation({ x: (roof.left + roof.right) / 2, y: roof.top + 0.435, z: 0 }, true);
    d.cat.setLinvel({ x: 0, y: 0, z: 0 }, true);
  });
  for (const pose of ['groom', 'loaf', 'sploot', 'sleep', 'side-sleep', 'roll']) {
    await page.getByLabel('Preview cat pose').selectOption(pose);
    await page.evaluate(() => {
      document.querySelector('.pet3d-layer').__petDebug.input.debugTime = 2.5;
    });
    await page.waitForTimeout(700);
    const error = await page.evaluate(async () => {
      const { Box3 } = await import('/node_modules/.vite/deps/three.js');
      const d = document.querySelector('.pet3d-layer').__petDebug;
      // The root also contains an invisible letter-theft sprite. Box3 includes
      // hidden objects, so measure the three actual cat skins independently.
      const bounds = new Box3();
      for (const skin of d.model.skins) bounds.union(new Box3().setFromObject(skin, true));
      return (bounds.min.y - d.input.support.top) * 40;
    });
    expect(Math.abs(error), `${pose} floor error`).toBeLessThan(2.1);
  }
  await page.screenshot({ path: '/tmp/still-motion-grounded-browser.png' });
});

test('a kitten inside calendar cells physically navigates out to the calendar roof', async ({
  page,
}) => {
  test.setTimeout(45000);
  for (const row of [20, 24]) {
    await page.getByLabel('Preview cat pose').selectOption('idle');
    const roofId = await page.evaluate((row) => {
      const d = document.querySelector('.pet3d-layer').__petDebug;
      const cell = d.layout.current.surfaces.find(
        (s) => !s.sticky && s.kind === 'panel' && -s.top > row && -s.top < row + 2,
      );
      const roof = d.layout.current.surfaces.find((s) => s.kind === 'calendar');
      d.cat.setTranslation({ x: (cell.left + cell.right) / 2, y: cell.top + 0.435, z: 0 }, true);
      d.cat.setLinvel({ x: 0, y: 0, z: 0 }, true);
      return roof.id;
    }, row);
    await page.waitForTimeout(350);
    await page.getByLabel('Cat destination').selectOption(roofId);
    await expect(layer(page)).toHaveAttribute('data-support-id', roofId, { timeout: 16000 });
    await expect(layer(page)).toHaveAttribute('data-grounded', 'true');
    expect(Number(await layer(page).getAttribute('data-route-failures'))).toBe(0);
  }
});

test('sticky sidebar text uses the same document origin before and after scrolling', async ({
  page,
}) => {
  for (const y of [0, 300, 600]) {
    await page.evaluate((y) => scrollTo(0, y), y);
    const error = await page.evaluate(async () => {
      const { collectTextTargets } = await import('/src/lib/pet3d/textMischief.js');
      const host = document.querySelector('.pet3d-host');
      const t = collectTextTargets(host, (x, y) => ({ x, y })).find(
        (t) => t.element.closest('.sidebar') && t.node.textContent.includes('Search workspace'),
      );
      const r = document.createRange();
      r.selectNodeContents(t.node);
      return Math.abs(t.top + host.getBoundingClientRect().top - r.getBoundingClientRect().top);
    });
    expect(error).toBeLessThan(0.1);
  }
});

test('claw grooves require contact, persist for seconds, and preserve React text and storage', async ({
  page,
}) => {
  await page.getByLabel('Preview cat pose').selectOption('idle');
  const result = await page.evaluate(async () => {
    const { collectTextTargets, createTextMischief } =
      await import('/src/lib/pet3d/textMischief.js');
    const host = document.querySelector('.pet3d-host'),
      target = collectTextTargets(host, (x, y) => ({ x, y })).find(
        (t) => t.node.textContent === 'Your journal',
      );
    const text = target.node.textContent,
      storage = JSON.stringify({ ...localStorage });
    const original = Math.random;
    Math.random = () => 0;
    const input = { paused: false, reduced: false },
      engine = createTextMischief(host, input);
    window.reviewMischief = engine;
    const far = engine.scratch(target, { x: 0, y: 0 });
    const contact = { x: (target.left + 12) / 40, y: -(target.top + target.height / 2) / 40 };
    const near = engine.scratch(target, contact);
    Math.random = original;
    return {
      far,
      near,
      textPreserved: text === target.node.textContent,
      storagePreserved: storage === JSON.stringify({ ...localStorage }),
      paths: host.querySelector('.pet3d-claw-mark')?.querySelectorAll('path').length,
    };
  });
  expect(result).toEqual({
    far: false,
    near: true,
    textPreserved: true,
    storagePreserved: true,
    paths: 6,
  });
  await page.waitForTimeout(1200);
  await expect(page.locator('.pet3d-claw-mark')).toHaveCount(1);
  await expect(page.locator('.pet3d-claw-mark')).toHaveCount(0, { timeout: 5000 });
  await page.evaluate(() => window.reviewMischief.dispose());
});

test('a natural nap survives idle-cursor opportunities, and sound stays opt-in and persisted', async ({
  page,
}) => {
  // Includes a real idle interval, WebGL startup and a second page load.
  test.setTimeout(60000);
  await page.getByLabel('Preview cat pose').selectOption('idle');
  await page.evaluate(() => {
    const d = document.querySelector('.pet3d-layer').__petDebug;
    const roof = d.layout.current.surfaces.find((s) => s.kind === 'calendar');
    d.cat.setTranslation({ x: 20, y: roof.top + 0.435, z: 0 }, true);
    d.cat.setLinvel({ x: 0, y: 0, z: 0 }, true);
  });
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: 'Preview natural nap' }).click();
  await expect(layer(page)).toHaveAttribute('data-behavior', /^(sleep|side-sleep)$/, {
    timeout: 7000,
  });
  await page.mouse.move(1050, 550);
  await page.waitForTimeout(8500);
  await expect(layer(page)).toHaveAttribute('data-behavior', /^(sleep|side-sleep)$/);
  await expect(page.locator('html')).not.toHaveAttribute('data-pet-cursor');
  await page.getByRole('button', { name: 'Open settings', exact: true }).first().click();
  await expect(page.getByLabel('Enable companion sounds')).not.toBeChecked();
  await page.getByLabel('Enable companion sounds').check();
  await page.reload();
  await page.getByRole('button', { name: 'Open settings', exact: true }).first().click();
  await expect(page.getByLabel('Enable companion sounds')).toBeChecked();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('still-motion-preferences'))),
  ).toEqual({ catEnabled: true, ballEnabled: false, soundEnabled: true });
});
