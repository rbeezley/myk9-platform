import { expect, test, type Page, type Route } from '@playwright/test';
import { signInAsJudge } from '../uat/shared/auth';

/**
 * Suite category: feature-audit.
 *
 * Regression guard for the at-show judge write-authorization path (PR #886).
 * A judge-role account is NOT admitted by the `entries` UPDATE RLS policy
 * (managers only), so ringside writes are routed through the SECURITY DEFINER
 * `ringside_update_entry` RPC, which authorizes class-assigned judges. Before
 * that fix a judge's score silently failed on sync.
 *
 * This proves the routing: signed in as the seeded e2e-judge (assigned to the
 * Heartland demo show's classes), a submitted score must (a) go out as a
 * `rpc/ringside_update_entry` call carrying the score in `p_fields`, not a
 * direct `entries` PATCH, and (b) land in the offline replica. The RPC is
 * intercepted so verification never mutates the shared Supabase project.
 *
 * Fixture: Heartland Scent Work Classic demo seed (judge_assignments seeded for
 * these classes). If the seed is rebuilt, update the IDs together.
 */

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';
const CLASS_ID = 'dec1a55e-0000-0000-0000-000000000032';
const ENTRY_ID = 'dededede-0000-0000-0000-000000000052';
const SCORE_PATH = `/at-show/${SHOW_ID}/class/${CLASS_ID}/score/${ENTRY_ID}`;
const CLASS_PATH = `/at-show/${SHOW_ID}/class/${CLASS_ID}`;
// Mirrors @myk9/replication constants (packages/replication/src/constants.ts,
// core/DatabaseManager.ts).
const REPLICATION_DB_NAME = 'myK9_Replication';
const REPLICATED_TABLES_STORE = 'replicated_tables';

type RpcCall = { p_entry_id?: string; p_fields?: Record<string, unknown> };

test.describe('At-show judge scoring authorization', () => {
  // KNOWN-BLOCKED (fixme): PR #886 fixed the judge WRITE path (ringside_update_entry
  // authorizes class-assigned judges), but judge ringside is still blocked on the
  // READ side — entry reads flow through `view_authenticated_entry_results`, gated
  // `can_manage OR is_own_entry`, so a judge gets "Entry not found" and never
  // reaches scoring. This spec passes once a read path admits assigned judges /
  // ringside-session passcodes (follow-up RLS work). Kept as the regression guard
  // for that fix. See docs/plan-atshow-ringside-writes.md.
  test.fixme(
    'routes a judge score through ringside_update_entry and persists it',
    async ({ page }) => {
    const rpcCalls: RpcCall[] = [];
    await interceptRingsideRpc(page, rpcCalls);

    await signInAsJudge(page, SCORE_PATH);
    await expect(page).toHaveURL(new RegExp(escapeRegExp(SCORE_PATH)));
    // The scoresheet engine only mounts for a role with canScore — reaching the
    // Save button proves the judge passed the structural canScore gate.
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => readEntryReplica(page)).not.toBeNull();

    await page.getByTestId('result-Q').click();
    await page.getByRole('button', { name: /^Save$/ }).click();
    await page.getByRole('button', { name: /Confirm & Submit/i }).click();

    await expect(page).toHaveURL(new RegExp(escapeRegExp(CLASS_PATH)), { timeout: 15_000 });

    // (a) The score went out through the authorization RPC, carrying the score
    // in p_fields — NOT a direct entries PATCH (which RLS would reject for a judge).
    await expect
      .poll(
        () =>
          rpcCalls.some(
            call =>
              call.p_entry_id === ENTRY_ID &&
              call.p_fields?.result_status === 'qualified' &&
              call.p_fields?.is_scored === true
          ),
        { timeout: 20_000 }
      )
      .toBe(true);

    // (b) The score persisted to the offline replica (offline-first write).
    await expect
      .poll(() => readEntryReplica(page), { timeout: 10_000 })
      .toMatchObject({
        data: expect.objectContaining({ result_status: 'qualified', is_scored: true }),
      });
  });
});

/**
 * Intercept the ringside write RPC so the test never mutates shared staging.
 * Collects each call's args and returns a bumped version integer (the RPC's
 * real return shape), letting the client treat the sync as successful.
 */
async function interceptRingsideRpc(page: Page, rpcCalls: RpcCall[]) {
  await page.route('**/rest/v1/rpc/ringside_update_entry', async (route: Route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      await route.continue();
      return;
    }
    rpcCalls.push((request.postDataJSON() ?? {}) as RpcCall);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(100 + rpcCalls.length),
    });
  });
}

async function readEntryReplica(page: Page) {
  return page.evaluate(
    ({ dbName, storeName, entryId }) =>
      new Promise<{ data?: Record<string, unknown> } | null>(resolve => {
        const openReq = indexedDB.open(dbName);
        openReq.onerror = () => resolve(null);
        openReq.onsuccess = () => {
          const db = openReq.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.close();
            resolve(null);
            return;
          }
          const getReq = db
            .transaction(storeName, 'readonly')
            .objectStore(storeName)
            .get(['entries', entryId]);
          getReq.onsuccess = () => {
            const row = getReq.result as { data?: Record<string, unknown> } | undefined;
            db.close();
            resolve(row ? { data: row.data } : null);
          };
          getReq.onerror = () => {
            db.close();
            resolve(null);
          };
        };
      }),
    { dbName: REPLICATION_DB_NAME, storeName: REPLICATED_TABLES_STORE, entryId: ENTRY_ID }
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
