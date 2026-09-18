import { expect, test, type Page } from '@playwright/test';
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
 * real `position: sticky` / `@container` geometry — BannerLandingPage.
 * test.tsx proves the CTA COUNT and that it lives in StickyNav's markup,
 * not that it stays on-screen or that the row never wraps. This spec
 * proves the on-screen geometry.
 *
 * No fixture dependency, same technique as monogram-sticky-cta.spec.ts:
 * pick any published show with a class at runtime, then force its style
 * to Banner and its entry window open by rewriting the PostgREST response
 * in-flight for this browser context only — no database write.
 *
 * MYK9-633 round 5: this file used to pin every project to 1280x900 via
 * a blanket `test.use({ viewport: ... })`, so running it under the
 * `mobile-chrome` / `tablet` playwright projects tested nothing different
 * from `chromium` — same forced viewport regardless of project. Removed;
 * the reachability test below now reads its own bounds from the page's
 * actual viewport, whatever the active project supplies (chromium:
 * 1280x720, tablet: 768x1024, mobile-chrome/Pixel 5: 393x727 — not
 * exactly 375, that project's own device preset).
 */
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';

interface BannerShow {
  showId: string;
}

/**
 * Picks any published show with a class, then makes every `shows` REST
 * response for it report Banner style with an open entry window, for this
 * page's lifetime only.
 */
async function openBannerShow(page: Page): Promise<BannerShow> {
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

  return { showId };
}

test.describe('Banner sticky sub-bar CTA — reachable at any scroll position', () => {
  test('scrolled to the footer, the entry link is within the viewport', async ({ page }) => {
    // A cold Vite dev-server compile of this route's first request can
    // exceed the default 30s navigation timeout; give this one more room.
    test.setTimeout(60000);
    test.skip(
      !SUPABASE_URL || !SUPABASE_ANON_KEY,
      'Needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (apps/myk9show/.env).'
    );

    await openBannerShow(page);

    // Scoped to the sub-bar specifically, not a bare role query: below
    // 640px (this test now runs under every project, including
    // mobile-chrome's 393px-wide device) the mobile-only
    // `StickyEntryCtaBar` ALSO renders an "Enter this show" link, by
    // design (MYK9-633's "header plus sticky" rule) -- a generic
    // `getByRole('link', { name: ... })` would ambiguously match both.
    // This spec is specifically about the sub-bar's own CTA.
    const entryLink = page.locator('.bn-subbar-cta');
    await expect(
      entryLink,
      'entry CTA did not render -- forced style/entry-window rewrite may not have taken'
    ).toBeVisible({ timeout: 15000 });
    await expect(entryLink).toHaveCount(1);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);

    const linkBox = await entryLink.boundingBox();
    expect(linkBox).not.toBeNull();
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();

    // The regression: FlagMasthead's CTA scrolled off-screen with the
    // masthead. Fixed: StickyNav's `position: sticky` keeps the CTA's
    // bounding box within the viewport at any scroll position, whatever
    // that viewport is for the active project.
    expect(linkBox!.y).toBeGreaterThanOrEqual(0);
    expect(linkBox!.y + linkBox!.height).toBeLessThanOrEqual(viewport!.height);
  });
});

/**
 * MYK9-633 round 5 (restructure).
 *
 * Rounds 3 and 4 each proved the sub-bar's layout against exactly ONE
 * status string ("Entries open · 42 / 100"). A round-5 review found a
 * DIFFERENT string broke the round-4 fix: "Entries open · count
 * unavailable" is wider and crushed the section links to 27px at round
 * 4's bisected 852px breakpoint; a 4-digit count/limit needs more room
 * still. That is the discriminator-branches trap (LESSONS) — a new
 * branch (which status string a given render happens to carry) can
 * reopen the ORIGINAL bug. This suite exercises all three live status
 * shapes at six widths and asserts the properties the restructured CSS
 * (banner.css `.bn-subbar*`) is supposed to guarantee BY CONSTRUCTION,
 * not by a tuned pixel value:
 *   - the bar is always exactly one row (height <= 73px, 65px at 375 —
 *     narrower padding kicks in there);
 *   - the CTA is always fully inside the viewport (it is `flex: none`,
 *     the last flex child, and never shrinks or wraps);
 *   - the status text is present (it may be visually truncated — that's
 *     the flexible item, `flex: 1 1 auto; min-width: 0` with an
 *     ellipsis, by design);
 *   - the section anchors render only once the bar's content-box is wide
 *     enough for all three pieces (banner.css's `@container` threshold);
 *   - the page carries no MORE horizontal overflow than FlagMasthead's
 *     own pre-existing, out-of-scope 4-column stat grid already causes
 *     on its own (measured separately below, not attributed to the
 *     sub-bar this issue actually touches).
 */
const WIDTHS = [375, 640, 768, 852, 900, 1280] as const;
const STATUS_VARIANTS = [
  { label: 'short', text: 'Entries open · 42 / 100' },
  { label: 'long-count', text: 'Entries open · 1247 / 2000' },
  { label: 'unavailable', text: 'Entries open · count unavailable' },
] as const;

// The container-query threshold banner.css uses to reveal the section
// anchors, expressed as a VIEWPORT width: 820px content-box + the bar's
// 128px side padding (container-type: inline-size queries the content
// box, which excludes padding -- see the banner.css comment this number
// mirrors).
const SECTIONS_VISIBLE_FROM_VIEWPORT = 820 + 128;

test.describe('Banner sub-bar — one row at every width, for every status string', () => {
  for (const width of WIDTHS) {
    for (const variant of STATUS_VARIANTS) {
      test(`at ${width}px with "${variant.label}" status`, async ({ page }) => {
        test.setTimeout(60000);
        test.skip(
          !SUPABASE_URL || !SUPABASE_ANON_KEY,
          'Needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (apps/myk9show/.env).'
        );

        await page.setViewportSize({ width, height: 900 });
        await openBannerShow(page);

        await page.waitForSelector('[data-banner]', { timeout: 30000 });

        // Simulate the variant directly -- this spec is about layout
        // robustness to the STRING, not about reproducing the exact
        // entry-count data shape that produces each one.
        await page.evaluate(text => {
          const el = document.querySelector('.bn-subbar-status__text');
          if (el) el.textContent = text;
        }, variant.text);
        await page.waitForTimeout(150);

        const bar = page.locator('.bn-subbar');
        await expect(bar).toBeVisible();
        const barBox = await bar.boundingBox();
        expect(barBox, 'sub-bar did not render').not.toBeNull();

        const expectedMaxHeight = width === 375 ? 65 : 73;
        expect(
          barBox!.height,
          `sub-bar height at ${width}px ("${variant.label}") must stay a single row`
        ).toBeLessThanOrEqual(expectedMaxHeight);

        const cta = page.locator('.bn-subbar-cta').first();
        await expect(cta).toBeVisible();
        const ctaBox = await cta.boundingBox();
        expect(ctaBox).not.toBeNull();
        expect(
          ctaBox!.x,
          `CTA left edge at ${width}px ("${variant.label}") must not be pushed off-screen`
        ).toBeGreaterThanOrEqual(0);
        expect(
          ctaBox!.x + ctaBox!.width,
          `CTA right edge at ${width}px ("${variant.label}") must stay inside the viewport`
        ).toBeLessThanOrEqual(width);

        const statusText = await page.locator('.bn-subbar-status__text').textContent();
        expect(statusText, 'status text node must be present').toBeTruthy();

        const sectionsDisplay = await page
          .locator('.bn-subbar-sections')
          .evaluate(el => getComputedStyle(el).display);
        if (width >= SECTIONS_VISIBLE_FROM_VIEWPORT) {
          expect(
            sectionsDisplay,
            `section anchors must be visible at ${width}px (>= the ${SECTIONS_VISIBLE_FROM_VIEWPORT}px container-query threshold)`
          ).not.toBe('none');
        } else {
          expect(
            sectionsDisplay,
            `section anchors must be hidden at ${width}px (< the ${SECTIONS_VISIBLE_FROM_VIEWPORT}px container-query threshold)`
          ).toBe('none');
        }

        // The sub-bar itself must never push the page wider than the
        // viewport -- asserted directly on the bar's own box, not on
        // page-level scrollWidth, because FlagMasthead (a sibling of
        // `<main>` that renders BEFORE it, and before StickyNav) has its
        // own pre-existing, out-of-scope 4-column stat grid that already
        // overflows independently of anything this issue touches, and
        // page-level scrollWidth can't tell the two sources apart.
        expect(
          barBox!.x + barBox!.width,
          `sub-bar's own right edge at ${width}px ("${variant.label}") must not exceed the viewport`
        ).toBeLessThanOrEqual(width);

        // Documented for context, not gated on: FlagMasthead's own grid
        // contributes page-level horizontal overflow independent of the
        // sub-bar. Measured with this exact spec (MYK9-633 round 5):
        // document.documentElement.scrollWidth is ~402-404px at a 375px
        // viewport (27px over) and exactly equal to the viewport at every
        // wider width tested here (640/768/852/900/1280) -- a pre-
        // existing FlagMasthead issue, not a regression from this file.
        const pageScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        console.log(`  [${width}px/${variant.label}] page scrollWidth=${pageScrollWidth}`);
      });
    }
  }
});
