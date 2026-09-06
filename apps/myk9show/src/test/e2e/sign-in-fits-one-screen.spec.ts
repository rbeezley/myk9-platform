import { test, expect } from '@playwright/test';

/**
 * The sign-in front door must not scroll.
 *
 * Adding the Google and Apple buttons pushed the credential field below the
 * fold: at 1440x760 the page overflowed by 73px, so the field you type into
 * was only reachable by scrolling. This asserts rendered GEOMETRY rather than
 * any class or copy, so it fails for whatever reason the card grows again —
 * a taller heading, a third provider, a restored helper line.
 *
 * 760px is a 1440x900 laptop window minus browser chrome; 812 is an
 * iPhone-class viewport. Both are the real thing, not the OS window size.
 */
const VIEWPORTS = [
  { name: 'laptop', width: 1440, height: 760 },
  { name: 'phone', width: 375, height: 812 },
] as const;

test.describe('sign-in fits one screen', () => {
  for (const vp of VIEWPORTS) {
    test(`no scrolling at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/sign-in', { waitUntil: 'commit', timeout: 60000 });

      const field = page.getByTestId('credential-input');
      await expect(field).toBeVisible({ timeout: 30000 });

      const overflow = await page.evaluate(
        () => document.documentElement.scrollHeight - window.innerHeight
      );
      expect(overflow, 'page overflows the viewport vertically').toBeLessThanOrEqual(0);

      const horizontal = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(horizontal, 'page overflows horizontally').toBeLessThanOrEqual(0);

      // The field, the submit and both providers must be reachable without scrolling.
      for (const target of [
        field,
        page.getByTestId('continue-button'),
        page.getByRole('button', { name: /continue with google/i }),
        page.getByRole('button', { name: /continue with apple/i }),
      ]) {
        const box = await target.boundingBox();
        expect(box, 'control did not render').not.toBeNull();
        expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
      }

      // Touch targets stay at the 44px floor.
      for (const name of [/continue with google/i, /continue with apple/i]) {
        const box = await page.getByRole('button', { name }).boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
    });

    test(`no scrolling at ${vp.name} with the PWA install banner`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/sign-in', { waitUntil: 'commit', timeout: 60000 });
      await expect(page.getByTestId('credential-input')).toBeVisible({ timeout: 30000 });

      // Reproduce what PWAInstallBanner actually contributes to layout: the
      // class on <html> (which drives --pwa-banner-height / --app-top-inset)
      // AND the in-flow spacer it renders above the outlet
      // (PWAInstallBanner.tsx:94). The class alone only shrinks the page's
      // min-height, which can never overflow — the spacer is what grows it.
      const spacerHeight = await page.evaluate(() => {
        document.documentElement.classList.add('pwa-banner-visible');
        // The banner mounts as the FIRST CHILD of the min-h-screen app shell
        // (App.tsx:228), so its spacer competes with the page inside that
        // shell's height. Prepending to <body> instead would sit outside the
        // shell and invent overflow that the real app never has.
        const shell = document.querySelector('.min-h-screen.transition-colors');
        if (!shell) throw new Error('app shell not found — selector drifted');
        const spacer = document.createElement('div');
        spacer.setAttribute('data-test-pwa-spacer', '');
        spacer.style.height = 'var(--pwa-banner-height, 0px)';
        shell.prepend(spacer);
        return spacer.getBoundingClientRect().height;
      });
      expect(spacerHeight, 'the banner spacer has no height').toBeGreaterThanOrEqual(52);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollHeight - window.innerHeight
      );
      expect(overflow, 'page overflows once the install banner is shown').toBeLessThanOrEqual(0);
    });
  }
});
