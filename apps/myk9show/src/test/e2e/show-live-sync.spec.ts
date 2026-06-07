/**
 * Show live-sync (Phase 2) — live-Realtime browser E2E.
 *
 * OPT-IN / LOCAL-ONLY. The deterministic, CI-safe verification lives in
 * src/test/features/show-live-sync/useShowLiveSync.test.tsx. This is the
 * real-Realtime smoke that Phase 1 taught us to run before flipping the flag
 * (CI-green ≠ works on the real socket).
 *
 * Phase 2 has no visual indicator by design (the data just refreshes silently),
 * so the observable proof is the `replication:sync-requested` nudge: the app,
 * running in a real browser with the flag on, opens the show-live channel and
 * fires that window event within ~1-2s of a real change to the show's entries.
 *
 * To run (from apps/myk9show):
 *   VITE_SHOW_LIVE_SYNC=true RUN_LIVE_SYNC_E2E=1 npx playwright test \
 *     src/test/e2e/show-live-sync.spec.ts --project=chromium
 *
 * Requires VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env (apps/myk9show/.env)
 * to generate the change. The change is a REVERSIBLE same-value UPDATE on one
 * entry (no data is altered; it only produces the WAL/Realtime event).
 */

import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { TEST_USERS, type TestUser } from './helpers/testUsers';

const RUN = process.env.RUN_LIVE_SYNC_E2E === '1';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

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

test.describe('Show live-sync — live Realtime', () => {
  test.describe.configure({ timeout: 120_000 });

  test('a real entry change fires the replication:sync-requested nudge', async ({ page }) => {
    test.skip(!RUN, 'Opt-in: VITE_SHOW_LIVE_SYNC=true + RUN_LIVE_SYNC_E2E=1.');
    test.skip(!SUPABASE_URL || !SERVICE_KEY, 'Needs VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.');

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // Find a show that has at least one entry, plus a benign column to touch.
    const { data: entryRow } = await admin
      .from('entries')
      .select('id, show_id')
      .not('show_id', 'is', null)
      .limit(1)
      .maybeSingle();
    expect(entryRow, 'a staging entry with a show_id must exist').toBeTruthy();
    const showId = entryRow!.show_id as string;
    const entryId = entryRow!.id as string;

    const { data: fullEntry } = await admin.from('entries').select('*').eq('id', entryId).single();
    const touchCol = ['updated_at', 'notes', 'armband', 'run_order', 'check_in_status'].find(
      c => fullEntry && c in fullEntry
    )!;
    const touchVal = (fullEntry as Record<string, unknown>)[touchCol];

    // Open the show — ShowDetailsPage wraps it in ShowPresenceProvider, which
    // mounts useShowLiveSync(showId). Confirm we landed (not bounced to sign-in).
    await signIn(page, TEST_USERS.SECRETARY);
    await page.goto(`/shows/${showId}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`/shows/${showId}`), { timeout: 15000 });

    // Count live-sync nudges. The 60s background poll calls triggerSync directly
    // (no window event), so a positive count specifically proves the live-sync
    // hook dispatched it — not some other refresh path.
    await page.evaluate(() => {
      (window as unknown as { __lsNudges: number }).__lsNudges = 0;
      window.addEventListener('replication:sync-requested', () => {
        (window as unknown as { __lsNudges: number }).__lsNudges += 1;
      });
    });

    // Give the Realtime channel time to reach SUBSCRIBED before the change.
    await page.waitForTimeout(4000);
    await page.evaluate(() => {
      (window as unknown as { __lsNudges: number }).__lsNudges = 0;
    });

    // Generate ONE reversible same-value UPDATE on the show's entry.
    const { error } = await admin
      .from('entries')
      .update({ [touchCol]: touchVal })
      .eq('id', entryId);
    expect(error, 'touch update should succeed').toBeFalsy();

    // The hook debounces 400ms then dispatches. Allow generous Realtime latency.
    await expect
      .poll(
        () => page.evaluate(() => (window as unknown as { __lsNudges: number }).__lsNudges),
        { timeout: 15000, message: 'live-sync nudge never fired after the entry change' }
      )
      .toBeGreaterThan(0);
  });
});
