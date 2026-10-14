import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.clock.install({ time: new Date(2026, 9, 15, 12) });
  // These checks isolate the HTML atmosphere; the WebGL suite exercises the 3D companion.
  await page.addInitScript(() =>
    localStorage.setItem('still-motion-preferences', JSON.stringify({ catEnabled: false })),
  );
  await page.goto('/');
});
test('workspace themes apply to portals and ambient lighting uses transforms', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('data-workspace-theme', 'personal');
  await expect(page.locator('.journal-atmosphere .ambient-mote')).toHaveCount(44);
  await page.mouse.move(1500, 800);
  await page.clock.runFor(1000);
  await expect(page.locator('.light-parallax')).toHaveAttribute('style', /translate3d/);
  await page.getByRole('button', { name: /^Switch workspace/ }).click();
  await page.getByRole('menuitemradio', { name: /Work/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-workspace-theme', 'work');
  await page.getByRole('button', { name: 'New entry', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCSS('background-color', 'rgb(24, 33, 57)');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-workspace-theme', 'work');
});
test('reduced motion updates ambient lighting live', async ({ page }) => {
  await page.mouse.move(1450, 700);
  await page.clock.runFor(500);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.light-parallax')).not.toHaveAttribute('style', /translate3d/);
  await expect(page.locator('.ambient-mote').first()).toHaveCSS('animation-name', 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.mouse.move(1400, 700);
  await page.clock.runFor(500);
  await expect(page.locator('.light-parallax')).toHaveAttribute('style', /translate3d/);
});
