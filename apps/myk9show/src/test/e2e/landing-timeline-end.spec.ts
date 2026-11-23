import { expect, test } from '@playwright/test';

// MYK9-1285: the timeline must not end in a blank band (it was half a screen of empty cream), or
// the page reads as ending. With the end of the last step on screen, the next section's heading
// ("What it costs", since MYK9-1894 moved the trust bar under the hero) is on screen too.
// MYK9-2334: the last step is now Results, a full scene taller than one screen, so the check is
// measured from the step's end, not its top.
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
    test(`${vp.name}: ${audience.name} reaches the pricing heading from the end of the last step`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await expect(page.locator('#pricing-title')).toBeAttached({ timeout: 30000 });
      if (audience.button) await page.getByRole('button', { name: audience.button }).click();

      // Lazy images above keep shifting layout, so re-read the target while settling on it.
      // The last step's bottom edge is put at the bottom of the screen.
      const geometry = await page.evaluate(async () => {
        const rows = document.querySelectorAll('.lc-row');
        const last = rows[rows.length - 1];
        for (let i = 0; i < 30; i += 1) {
          window.scrollTo({
            top: last.getBoundingClientRect().bottom + window.scrollY - window.innerHeight,
            behavior: 'instant',
          });
          await new Promise(resolve => setTimeout(resolve, 80));
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        const title = document.getElementById('pricing-title')!.getBoundingClientRect();
        return {
          stepBottom: last.getBoundingClientRect().bottom,
          titleTop: title.top,
          titleHeight: title.height,
          innerHeight: window.innerHeight,
        };
      });

      expect(Math.abs(geometry.stepBottom - geometry.innerHeight)).toBeLessThan(4);
      // One scroll of at most a third of a screen past the step's end shows the whole heading.
      expect(geometry.titleTop + geometry.titleHeight - geometry.stepBottom).toBeLessThanOrEqual(
        geometry.innerHeight / 3
      );
    });
  }
}
