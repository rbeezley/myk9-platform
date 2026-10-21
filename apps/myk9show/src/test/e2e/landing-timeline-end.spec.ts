import { expect, test } from '@playwright/test';

// MYK9-1285: with the last timeline step at the top of the screen, the next section's heading
// ("Built by the team behind mySWT and myNWT") is on screen too, so the page does not read as ending.
const VIEWPORTS = [
  { name: 'laptop', width: 1280, height: 900 },
  { name: 'phone', width: 375, height: 812 },
];
const AUDIENCES = [
  { name: 'club story', button: null },
  { name: 'exhibitor story', button: /entering a show/ },
];

for (const vp of VIEWPORTS) {
  for (const audience of AUDIENCES) {
    test(`${vp.name}: ${audience.name} reaches the trust heading from step 6`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await expect(page.locator('#trust-title')).toBeAttached({ timeout: 30000 });
      if (audience.button) await page.getByRole('button', { name: audience.button }).click();

      // Lazy images above keep shifting layout, so re-read the target while settling on it.
      const geometry = await page.evaluate(async () => {
        const rows = document.querySelectorAll('.lc-row');
        const last = rows[rows.length - 1];
        for (let i = 0; i < 30; i += 1) {
          window.scrollTo({
            top: last.getBoundingClientRect().top + window.scrollY,
            behavior: 'instant',
          });
          await new Promise(resolve => setTimeout(resolve, 80));
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        return {
          stepTop: last.getBoundingClientRect().top,
          titleBottom: document.getElementById('trust-title')!.getBoundingClientRect().bottom,
          innerHeight: window.innerHeight,
        };
      });

      expect(Math.abs(geometry.stepTop)).toBeLessThan(4);
      expect(geometry.titleBottom).toBeLessThanOrEqual(geometry.innerHeight);
    });
  }
}
