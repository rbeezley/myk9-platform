import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * MYK9-633 round 2.
 *
 * Banner's persistent header CTA lived in FlagMasthead — a full-bleed
 * hero band that is NOT sticky. Once the duplicate final-band CTA was
 * removed (round 1 of this issue), a desktop visitor scrolled past the
 * masthead had zero reachable entry action anywhere on the page. Fixed by
 * moving the CTA into StickyNav, the thin `position: sticky` sub-bar
 * directly under the masthead, which stays in the viewport at every
 * scroll position.
 *
 * jsdom (the unit test suite) has no layout engine and cannot compute
 * real `position: sticky` geometry — BannerLandingPage.test.tsx proves the
 * CTA COUNT and that it lives in StickyNav's markup, not that it stays
 * on-screen. This spec proves the on-screen geometry: after scrolling to
 * the very bottom of the page, the entry link's bounding box is still
 * within the viewport.
 *
 * No fixture dependency, same technique as monogram-sticky-cta.spec.ts:
 * pick any published show with a class at runtime, then force its style
 * to Banner and its entry window open by rewriting the PostgREST response
 * in-flight for this browser context only — no database write.
 */
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';

test.describe('Banner sticky sub-bar CTA — reachable at any scroll position', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('at 1280x900 scrolled to the footer, the entry link is within the viewport', async ({
    page,
  }) => {
    // A cold Vite dev-server compile of this route's first request can
    // exceed the default 30s navigation timeout; give this one more room.
    test.setTimeout(60000);
    test.skip(
      !SUPABASE_URL || !SUPABASE_ANON_KEY,
      'Needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (apps/myk9show/.env).'
    );

    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

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

      const forceBannerOpen = (row: unknown) => {
        if (!row || typeof row !== 'object' || (row as { id?: unknown }).id !== showId) return;
        const r = row as Record<string, unknown>;
        r.entry_close_date = '2099-01-01T00:00:00+00:00';
        r.style = 'banner';
        r.experience_is_published = false;
        r.experience_published_style = null;
      };
      if (Array.isArray(body)) {
        body.forEach(forceBannerOpen);
      } else {
        forceBannerOpen(body);
      }

      await route.fulfill({ response, json: body });
    });

    await page.goto(`/shows/${showId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const entryLink = page.getByRole('link', { name: 'Enter this show' });
    await expect(
      entryLink,
      'entry CTA did not render -- forced style/entry-window rewrite may not have taken'
    ).toBeVisible({ timeout: 15000 });

    // Exactly one entry CTA at this width (the sticky sub-bar's).
    await expect(page.getByRole('link', { name: 'Enter this show' })).toHaveCount(1);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);

    const linkBox = await entryLink.boundingBox();
    expect(linkBox).not.toBeNull();

    // The regression: FlagMasthead's CTA scrolled off-screen with the
    // masthead. Fixed: StickyNav's `position: sticky` keeps the CTA's
    // bounding box within the viewport at any scroll position.
    expect(linkBox!.y).toBeGreaterThanOrEqual(0);
    expect(linkBox!.y + linkBox!.height).toBeLessThanOrEqual(900);
  });
});
