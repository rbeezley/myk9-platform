import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

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
 * No fixture dependency (round-3 review, second pass): this used to pin one
 * ad-hoc staging show by id, an assumption a reseed can silently break --
 * the row disappearing, or simply not being Monogram-styled any more, both
 * read as a 15s "bar never appeared" timeout that looks exactly like a
 * geometry regression. Instead: pick ANY published show with at least one
 * class at runtime (Supabase anon read, same credentials the app itself
 * uses), then force its style to Monogram and its entry window open by
 * rewriting the PostgREST response in-flight, for this browser context
 * only -- no database write, and no dependency on the picked show's real
 * style or entry dates.
 */
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';

test.describe('Monogram sticky CTA bar — footer clears it at page end', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('at 375x812 scrolled to the end, the footer sits above the sticky bar', async ({ page }) => {
    test.skip(
      !SUPABASE_URL || !SUPABASE_ANON_KEY,
      'Needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (apps/myk9show/.env).'
    );

    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

    // `!inner` on both embeds turns them into filters: only a show with at
    // least one trial that has at least one class survives. Any such show
    // works -- its actual style/status/dates are irrelevant, all three are
    // forced below.
    const { data: candidates, error } = await anon
      .from('shows')
      .select('id, trials!inner(id, classes!inner(id))')
      .eq('status', 'published')
      .is('deleted_at', null)
      .limit(1);

    expect(error, 'reading a published show with classes must not error').toBeNull();
    expect(
      candidates?.length,
      'staging must have at least one published show with an assigned class for this spec to pick from'
    ).toBeGreaterThan(0);
    const showId = candidates![0].id as string;

    await page.route('**/rest/v1/shows*', async route => {
      const response = await route.fetch();
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        await route.fulfill({ response });
        return;
      }

      const forceMonogramOpen = (row: unknown) => {
        if (!row || typeof row !== 'object' || (row as { id?: unknown }).id !== showId) return;
        const r = row as Record<string, unknown>;
        r.entry_close_date = '2099-01-01T00:00:00+00:00';
        // getShowStyle() (features/registries/helpers.ts) falls back to
        // 'monogram' for any null/unrecognized value, but a published
        // EXPERIENCE style takes precedence over `style` when set -- clear
        // both so this show renders Monogram regardless of its real values.
        r.style = 'monogram';
        r.experience_is_published = false;
        r.experience_published_style = null;
      };
      if (Array.isArray(body)) {
        body.forEach(forceMonogramOpen);
      } else {
        forceMonogramOpen(body);
      }

      await route.fulfill({ response, json: body });
    });

    await page.goto(`/shows/${showId}`, { waitUntil: 'domcontentloaded' });

    const bar = page.getByRole('region', { name: /enter this show/i });
    await expect(
      bar,
      'sticky bar did not render -- forced style/entry-window rewrite may not have taken'
    ).toBeVisible({
      timeout: 15000,
    });

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
