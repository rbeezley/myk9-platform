/**
 * Show presence — two-context browser E2E (plan §8).
 *
 * OPT-IN / LOCAL-ONLY. This is the real-Realtime smoke; the deterministic,
 * CI-safe verification lives in
 * src/test/features/show-presence/showPresence.integration.test.tsx.
 *
 * To run:
 *   1. Start the dev server with the flag on:
 *        VITE_SHOW_PRESENCE=true pnpm dev:show
 *   2. RUN_PRESENCE_E2E=1 npx playwright test src/test/e2e/show-presence.spec.ts
 *
 * It is skipped by default because it needs the flag enabled, two seeded
 * exhibitor accounts, and a live Supabase Realtime connection (which is timing-
 * flaky and not available in the CI E2E job, currently disabled).
 */

import { test, expect, type Page } from '@playwright/test';
import { TEST_USERS, type TestUser } from './helpers/testUsers';

const RUN = process.env.RUN_PRESENCE_E2E === '1';

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

test.describe('Show presence — two contexts on one show', () => {
  test('each user sees the other in the presence stack', async ({ browser }) => {
    test.skip(
      !RUN,
      'Opt-in: run the dev server with VITE_SHOW_PRESENCE=true and set RUN_PRESENCE_E2E=1.'
    );

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    try {
      const a = await ctxA.newPage();
      const b = await ctxB.newPage();

      await signIn(a, TEST_USERS.EXHIBITOR);
      await signIn(b, TEST_USERS.EXHIBITOR_2);

      // A opens the first available show; B follows to the same URL.
      await a.goto('/shows', { waitUntil: 'domcontentloaded' });
      await a.locator('a[href^="/shows/"]').first().click();
      await a.waitForURL(/\/shows\/[^/]+$/, { timeout: 15000 });
      const showUrl = a.url();
      await b.goto(showUrl, { waitUntil: 'domcontentloaded' });

      // The stack's label reads "N people here" — plural means ≥2, i.e. each
      // user can see the other. Generous timeout for Realtime convergence.
      await expect(a.getByLabelText(/people here/)).toBeVisible({ timeout: 20000 });
      await expect(b.getByLabelText(/people here/)).toBeVisible({ timeout: 20000 });
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
