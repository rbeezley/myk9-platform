import { expect, test } from '@playwright/test';

/**
 * MYK9-565, round 3 restructure.
 *
 * Round 2 shipped a fixed mobile sticky "Enter this show" bar with an
 * in-flow spacer meant to reserve its height so the page's real content
 * isn't left underneath it. The spacer was wired to the wrong spot in the
 * document (mid-<main>, next to the CTA it repeats, BEFORE <MonogramFooter>)
 * so the actual last element on the page -- the footer -- stayed uncovered.
 * Measured in real Chrome at 375x812, scrolled to the end: the bar sat at
 * y 771-836, `.mg-footer__meta` at y 756-800 -- a 29px overlap, with
 * `elementFromPoint` on the footer's own coordinates returning the bar.
 *
 * jsdom (the unit test suite) has no layout engine and cannot reproduce that
 * pixel measurement; MonogramLandingPage.test.tsx instead proves the
 * DOCUMENT-ORDER fix (spacer is now the last element, after the footer).
 * This spec proves the actual on-screen geometry that document order is
 * supposed to guarantee.
 *
 * "ZZ Audit - Rewalk" is a real published Monogram-style show with classes
 * assigned, but its entry window (like every currently-published Monogram
 * show) is already closed, so its sticky bar would not render at all. This
 * test does not write to the shared database to force one open; it rewrites
 * the PostgREST response for this one show's `entry_close_date` in-flight,
 * for this browser context only, leaving every other field (and every other
 * show) untouched.
 */
const SHOW_ID = '75e078e9-81c3-46f0-aedd-94acfe15d353';

test.describe('Monogram sticky CTA bar — footer clears it at page end', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('at 375x812 scrolled to the end, the footer sits above the sticky bar', async ({ page }) => {
    await page.route('**/rest/v1/shows*', async route => {
      const response = await route.fetch();
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        await route.fulfill({ response });
        return;
      }

      const forceOpen = (row: unknown) => {
        if (row && typeof row === 'object' && (row as { id?: unknown }).id === SHOW_ID) {
          (row as { entry_close_date?: unknown }).entry_close_date = '2099-01-01T00:00:00+00:00';
        }
      };
      if (Array.isArray(body)) {
        body.forEach(forceOpen);
      } else {
        forceOpen(body);
      }

      await route.fulfill({ response, json: body });
    });

    await page.goto(`/shows/${SHOW_ID}`, { waitUntil: 'domcontentloaded' });

    const bar = page.getByRole('region', { name: /enter this show/i });
    await expect(bar).toBeVisible({ timeout: 15000 });

    const footerMeta = page.locator('.mg-footer__meta');
    await expect(footerMeta).toBeVisible();

    // Scroll to the true end of the document, same as a visitor reading to
    // the bottom of the page.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);

    const footerBox = await footerMeta.boundingBox();
    const barBox = await bar.boundingBox();
    expect(footerBox).not.toBeNull();
    expect(barBox).not.toBeNull();

    // The regression: the bar's top sat ABOVE the footer's bottom (they
    // overlapped). Fixed: the footer's bottom edge must clear the bar's top
    // edge once scrolled to the end.
    expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(barBox!.y);

    // elementFromPoint at the footer's own on-screen center must resolve to
    // the footer (or a descendant of it), not the bar -- this is the exact
    // check the round-2 review ran in real Chrome to find the regression.
    const centerX = footerBox!.x + footerBox!.width / 2;
    const centerY = footerBox!.y + footerBox!.height / 2;
    const hitsFooter = await page.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return !!el?.closest('.mg-footer__meta');
      },
      [centerX, centerY]
    );
    expect(hitsFooter).toBe(true);
  });
});
