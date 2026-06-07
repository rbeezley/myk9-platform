/**
 * Show presence — live-Realtime browser E2E (plan §8).
 *
 * OPT-IN / LOCAL-ONLY. This is the real-Realtime smoke; the deterministic,
 * CI-safe verification lives in
 * src/test/features/show-presence/showPresence.integration.test.tsx.
 *
 * To run:
 *   1. Start the dev server with the flag on (Playwright's webServer block does
 *      this automatically when VITE_SHOW_PRESENCE=true is in the env):
 *        VITE_SHOW_PRESENCE=true RUN_PRESENCE_E2E=1 npx playwright test \
 *          src/test/e2e/show-presence.spec.ts --project=chromium
 *
 * It is skipped by default because it needs the flag enabled, the seeded
 * secretary/exhibitor accounts, and a live Supabase Realtime connection (timing-
 * flaky, not available in the CI E2E job).
 *
 * Privacy model under test (plan §10 #2): staff see everyone; exhibitors see
 * only staff + themselves. So two EXHIBITORS must NOT see each other — the
 * original two-exhibitor assertion was wrong for this model and is replaced by
 * (1) a cross-role visibility test and (2) a live privacy-exclusion test.
 */

import { test, expect, type Page } from '@playwright/test';
import { TEST_USERS, type TestUser } from './helpers/testUsers';

const RUN = process.env.RUN_PRESENCE_E2E === '1';

// Role-agnostic locators for the PresenceStack's aria-label
// ("1 person here" / "N people here"). getByLabel targets form controls, so
// match the aria-label attribute directly on the (div) stack.
const PLURAL = '[aria-label$="people here"]'; // ≥2 present ("2 people here", …)
const SELF_ONLY = '[aria-label="1 person here"]'; // only the viewer present

async function signIn(page: Page, user: TestUser) {
  await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('credential-input')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('credential-input').fill(user.email);
  await page.getByTestId('continue-button').click();
  await expect(page.getByTestId('password-input')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('password-input').fill(user.password);
  await page.getByTestId('sign-in-button').click();
  await page.waitForURL(url => !url.pathname.includes('/sign-in'), { timeout: 15000 });
}

async function openFirstShow(page: Page): Promise<string> {
  await page.goto('/shows', { waitUntil: 'domcontentloaded' });
  await page.locator('a[href^="/shows/"]').first().click();
  await page.waitForURL(/\/shows\/[^/]+$/, { timeout: 15000 });
  return page.url();
}

test.describe('Show presence — live Realtime', () => {
  // Two contexts × (sign-in + navigation + ~Realtime convergence) overflows the
  // 30s default. Give the live socket room.
  test.describe.configure({ timeout: 120_000 });

  test('staff and exhibitor see each other (cross-role visibility)', async ({ browser }) => {
    test.skip(!RUN, 'Opt-in: VITE_SHOW_PRESENCE=true + RUN_PRESENCE_E2E=1.');

    const ctxSec = await browser.newContext();
    const ctxEx = await browser.newContext();
    try {
      const sec = await ctxSec.newPage();
      const ex = await ctxEx.newPage();

      // Parallel sign-ins to cut wall-time.
      await Promise.all([signIn(sec, TEST_USERS.SECRETARY), signIn(ex, TEST_USERS.EXHIBITOR)]);

      const showUrl = await openFirstShow(sec);
      await ex.goto(showUrl, { waitUntil: 'domcontentloaded' });

      // Secretary (staff) sees everyone; exhibitor sees staff — so each sees ≥2.
      // Generous timeout for Realtime convergence.
      await expect(sec.locator(PLURAL)).toBeVisible({ timeout: 20000 });
      await expect(ex.locator(PLURAL)).toBeVisible({ timeout: 20000 });
    } finally {
      await ctxSec.close();
      await ctxEx.close();
    }
  });

  // The privacy EXCLUSION (two exhibitors can't see each other) is fully covered
  // by unit tests — filterPresenceForViewer in JudgePresenceDot.test +
  // ShowPresenceProvider.test ("hides other exhibitors from an exhibitor viewer").
  // It was ALSO confirmed live during this feature's validation: two non-staff
  // users were both present on the channel (raw roster of 2) yet each rendered
  // only "1 person here". This live variant stays `fixme` because it needs a
  // SECOND well-formed exhibitor account — exhibitor2..5 in TEST_USERS are bare
  // stubs that don't reliably converge on Realtime as a second browser context
  // (exhibitor1/"Alice Martin" is the only confirmed-good exhibitor). Re-enable
  // once a second real exhibitor account exists.
  test.fixme(
    'exhibitors are hidden from each other (privacy filter, live)',
    async ({ browser }) => {
      const ctxA = await browser.newContext();
      const ctxB = await browser.newContext();
      try {
        const a = await ctxA.newPage();
        const b = await ctxB.newPage();

        await Promise.all([signIn(a, TEST_USERS.EXHIBITOR), signIn(b, TEST_USERS.EXHIBITOR_2)]);

        const showUrl = await openFirstShow(a);
        await b.goto(showUrl, { waitUntil: 'domcontentloaded' });

        // Both present on the channel, but each exhibitor's filter keeps only
        // self → "1 person here", never plural.
        await expect(a.locator(SELF_ONLY)).toBeVisible({ timeout: 20000 });
        await expect(b.locator(SELF_ONLY)).toBeVisible({ timeout: 20000 });
        await a.waitForTimeout(4000);
        await expect(a.locator(SELF_ONLY)).toBeVisible();
        await expect(a.locator(PLURAL)).toHaveCount(0);
      } finally {
        await ctxA.close();
        await ctxB.close();
      }
    }
  );
});
