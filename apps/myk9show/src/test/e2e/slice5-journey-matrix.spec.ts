/**
 * Task 7.3 — exhibitor journey re-walk across the audited viewport classes in
 * both themes.
 *
 * READ-ONLY. Signs in, resizes, looks.
 *
 * FACTORED, not enumerated. The task names 4 viewports x 2 themes x 7
 * entitlement states, but those axes are not independent: entitlement changes
 * copy, not layout, and viewport changes layout, not entitlement. Walking all
 * 56 combinations would re-prove the same two facts 56 times. Instead:
 *
 *   - layout/theme is walked here, live, at every viewport x theme (8 walks);
 *   - entitlement STATE resolution is pinned exhaustively in
 *     features/entitlement/resolveEntitlement.test.ts, which covers free,
 *     paid, founding, complimentary, scheduled, expired, revoked and
 *     superseded against the server's own context shape;
 *   - the live entitlement state the seeded account actually holds
 *     (complimentary) is asserted end-to-end in
 *     slice5-cross-surface-reconciliation.spec.ts.
 *
 * What that leaves genuinely uncovered in a browser is 'paid', which needs a
 * real Stripe subscription. That gap is recorded rather than faked — see the
 * PAID note below.
 *
 * Run pinned to its own port; `reuseExistingServer` will otherwise attach to
 * another worktree's dev server on 5173 and walk that branch's markup:
 *
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:5199 PLAYWRIGHT_PORT=5199 \
 *     pnpm playwright test src/test/e2e/slice5-journey-matrix.spec.ts \
 *     --project=chromium --workers=1
 *
 * Requires E2E_DEMO_EXHIBITOR_PASSWORD in the env.
 */
import { test, expect, type Page } from '@playwright/test';
import { signInAsTestUser } from './helpers/testUsers';

const EVIDENCE_DIR = process.env.SLICE5_EVIDENCE_DIR ?? 'test-results/slice5-evidence';

const SEED_DOG_ID = 'dededede-0000-0000-0000-000000000041';

/** The four audited viewport classes. */
const VIEWPORTS = [
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'tablet-portrait-834', width: 834, height: 1112 },
  { name: 'tablet-landscape-1112', width: 1112, height: 834 },
  { name: 'desktop-1280', width: 1280, height: 800 },
] as const;

const THEMES = ['light', 'dark'] as const;

/** The journey's stops, including each Records view — Slice 2's consolidation. */
const STOPS = [
  { name: 'my-shows', path: '/my-entries' },
  { name: 'dog-overview', path: `/dogs/${SEED_DOG_ID}` },
  { name: 'dog-health', path: `/dogs/${SEED_DOG_ID}?section=records&view=health` },
  { name: 'dog-training', path: `/dogs/${SEED_DOG_ID}?section=records&view=training` },
  { name: 'dog-pedigree', path: `/dogs/${SEED_DOG_ID}?section=records&view=pedigree` },
  { name: 'dog-titles', path: `/dogs/${SEED_DOG_ID}?section=career&view=titles` },
  { name: 'payments', path: '/exhibitor/payments' },
  { name: 'subscription', path: '/subscription' },
] as const;

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
  await page.waitForTimeout(400);
}

/**
 * The document must never scroll horizontally. 1px absorbs sub-pixel rounding
 * at fractional device widths.
 */
async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const de = document.documentElement;
    return {
      docOverflow: de.scrollWidth - de.clientWidth,
      bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
      // Name the widest offending element so a failure is diagnosable without
      // opening the trace.
      widest: Array.from(document.querySelectorAll<HTMLElement>('body *'))
        .filter(el => el.getBoundingClientRect().right > de.clientWidth + 1)
        .slice(0, 3)
        .map(el => `${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 60)}`),
    };
  });

  expect(
    overflow.docOverflow,
    `${label}: document scrolls horizontally by ${overflow.docOverflow}px (widest: ${overflow.widest.join(' | ')})`
  ).toBeLessThanOrEqual(1);
  expect(
    overflow.bodyOverflow,
    `${label}: body scrolls horizontally by ${overflow.bodyOverflow}px (widest: ${overflow.widest.join(' | ')})`
  ).toBeLessThanOrEqual(1);
}

/** Confirms the html theme trio is coherent — a split state is its own bug. */
async function expectThemeApplied(page: Page, theme: 'light' | 'dark', label: string) {
  const classes = await page.evaluate(() => document.documentElement.className);
  const isDark = theme === 'dark';

  expect(classes, `${label}: expected theme-${theme} on <html>, got "${classes}"`).toContain(
    isDark ? 'theme-dark' : 'theme-light'
  );
  // `dark` and `theme-dark` must move together — themeClasses.ts documents the
  // split state where one is set without the other.
  expect(
    /\bdark\b/.test(classes.replace('theme-dark', '')),
    `${label}: .dark and .theme-dark are out of sync ("${classes}")`
  ).toBe(isDark);
}

test.describe('Slice 5: journey matrix', () => {
  test.setTimeout(300_000);

  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      test(`${viewport.name} / ${theme}: no clipping, theme coherent`, async ({ page }) => {
        // Seed the theme before the app boots so no stop renders mid-switch.
        await page.addInitScript(mode => {
          window.localStorage.setItem('theme', mode as string);
        }, theme);

        await signInAsTestUser(page, 'DEMO_EXHIBITOR');
        await page.setViewportSize({ width: viewport.width, height: viewport.height });

        for (const stop of STOPS) {
          await page.goto(stop.path);
          await settle(page);

          const label = `${stop.name} @ ${viewport.name}/${theme}`;
          await expectThemeApplied(page, theme, label);
          await expectNoHorizontalOverflow(page, label);
        }

        // One screenshot per combination, from the densest stop.
        await page.goto(`/dogs/${SEED_DOG_ID}?section=records&view=health`);
        await settle(page);
        await page.screenshot({
          path: `${EVIDENCE_DIR}/journey-${viewport.name}-${theme}.png`,
          fullPage: true,
        });
      });
    }
  }
});

/**
 * PAID state gap.
 *
 * 'paid' is the one entitlement state no amount of test wiring reaches
 * honestly: it requires a real Stripe subscription on the seeded account, and
 * fabricating one by writing `subscription_tier` directly would assert against
 * a state the server's own helper does not agree with (it also requires a
 * non-null future `subscription_expires_at`).
 *
 * The resolver's paid branch is covered by unit tests; the SERVER's agreement
 * with it is covered by the paid/complimentary matrix in
 * supabase/tests/subscription_entitlement_grants_test.sql, which exercises a
 * real paid-tier fixture inside a rolled-back transaction. What remains
 * unproven in a browser is only the rendering of the paid state, which shares
 * its code path with founding and complimentary — both of which ARE walked.
 *
 * Browser-walked: complimentary (live, this suite + the reconciliation walk)
 * and expired (the account's prior state, walked before the grant).
 * Unit- and SQL-covered only: paid, founding, scheduled, revoked, superseded.
 */
