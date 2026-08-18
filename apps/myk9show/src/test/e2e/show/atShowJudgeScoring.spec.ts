import { expect, test, type Page } from '@playwright/test';
import { signInAsJudge } from '../uat/shared/auth';
import {
  installSharedStagingWriteGuard,
  type GuardedRingsideRpcCall,
} from '../helpers/sharedStagingWriteGuard';

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
 *
 * `strictRpcWrites` is on because this spec is part of the scheduled judge
 * replay (`pnpm test:e2e:audit:judge`), and that run reports that shared staging
 * received no writes. A permissive guard in ONE included spec would make the
 * claim false for the whole run, so every spec in the replay enforces it.
 */

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';
const CLASS_ID = 'dec1a55e-0000-0000-0000-000000000032';
const ENTRY_ID = 'dededede-0000-0000-0000-000000000052';
const SCORE_PATH = `/at-show/${SHOW_ID}/class/${CLASS_ID}/score/${ENTRY_ID}`;
const CLASS_PATH = `/at-show/${SHOW_ID}/class/${CLASS_ID}`;
const UNASSIGNED_CLASS_ID = 'dec1a55e-0000-0000-0000-000000000036';
const UNASSIGNED_ENTRY_ID = 'a1090000-0000-0000-0002-000000000005';
const UNASSIGNED_SCORE_PATH = `/at-show/${SHOW_ID}/class/${UNASSIGNED_CLASS_ID}/score/${UNASSIGNED_ENTRY_ID}`;
// Mirrors @myk9/replication constants (packages/replication/src/constants.ts,
// core/DatabaseManager.ts).
const REPLICATION_DB_NAME = 'myK9_Replication';
const REPLICATED_TABLES_STORE = 'replicated_tables';
const PENDING_MUTATIONS_STORE = 'pending_mutations';

test.describe('At-show judge scoring authorization', () => {
  test('routes a judge score through ringside_update_entry and persists it', async ({
    page,
  }) => {
    const rpcCalls: GuardedRingsideRpcCall[] = [];
    await installSharedStagingWriteGuard(page, { ringsideRpcCalls: rpcCalls, strictRpcWrites: true });

    await signInAsJudge(page, SCORE_PATH);
    await expect(page).toHaveURL(new RegExp(escapeRegExp(SCORE_PATH)));
    // The scoresheet engine only mounts for a role with canScore — reaching the
    // Save button proves the judge passed the structural canScore gate.
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => readEntryReplica(page)).not.toBeNull();

    // Refresh proves the authenticated session and the direct-route replica
    // hydration survive a browser restart before any score is entered.
    await page.reload();
    await expect(page).toHaveURL(new RegExp(escapeRegExp(SCORE_PATH)));
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => readEntryReplica(page)).not.toBeNull();

    await expect(page.getByRole('button', { name: /^Save$/ })).toBeDisabled();
    await page.getByTestId('result-Q').click();
    await page.getByRole('button', { name: /^Save$/ }).click();
    await page.getByRole('button', { name: /Confirm & Submit/i }).evaluate(button => {
      button.click();
      button.click();
    });

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
    await expect
      .poll(
        () =>
          rpcCalls.filter(
            call => call.p_entry_id === ENTRY_ID && call.p_fields?.is_scored === true
          ).length,
        { timeout: 5_000 }
      )
      .toBe(1);

    // (b) The score persisted to the offline replica (offline-first write).
    await expect
      .poll(() => readEntryReplica(page), { timeout: 10_000 })
      .toMatchObject({
        data: expect.objectContaining({ result_status: 'qualified', is_scored: true }),
      });
  });

  test('blocks an assigned judge from scoring an unassigned class before any write', async ({
    page,
  }) => {
    const rpcCalls: GuardedRingsideRpcCall[] = [];
    await installSharedStagingWriteGuard(page, { ringsideRpcCalls: rpcCalls, strictRpcWrites: true });

    await signInAsJudge(page, UNASSIGNED_SCORE_PATH);
    await expect(page).toHaveURL(new RegExp(escapeRegExp(UNASSIGNED_SCORE_PATH)));
    await expect(page.getByText("You're not assigned to judge this class")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('button', { name: /^Save$/ })).toHaveCount(0);
    expect(rpcCalls).toEqual([]);
  });

  test('records an explicit absence without exposing a qualified result', async ({ page }) => {
    const rpcCalls: GuardedRingsideRpcCall[] = [];
    await installSharedStagingWriteGuard(page, { ringsideRpcCalls: rpcCalls, strictRpcWrites: true });

    await signInAsJudge(page, SCORE_PATH);
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('result-ABS').click();
    await page.getByRole('button', { name: /^Save$/ }).click();
    await page.getByRole('button', { name: /Confirm & Submit/i }).click();

    await expect(page).toHaveURL(new RegExp(escapeRegExp(CLASS_PATH)), { timeout: 15_000 });
    // The judge may record an absence, but unreleased class results remain
    // hidden until the authorized results-release path marks them visible.
    await expect(page.getByText('Class complete')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Class podium' })).toHaveCount(0);
    await expect
      .poll(
        () =>
          rpcCalls.filter(
            call => call.p_entry_id === ENTRY_ID && call.p_fields?.is_scored === true
          ),
        { timeout: 20_000 }
      )
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            p_fields: expect.objectContaining({ result_status: 'absent', is_scored: true }),
          }),
        ])
      );
  });

  test('lets the judge pull a dog without turning it into a score', async ({ page }) => {
    const rpcCalls: GuardedRingsideRpcCall[] = [];
    await installSharedStagingWriteGuard(page, { ringsideRpcCalls: rpcCalls, strictRpcWrites: true });

    await signInAsJudge(page, CLASS_PATH);
    await expect(page.getByText('Change Status')).toHaveCount(0);
    await page.locator('[data-no-uppercase="true"]').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Pulled' }).click();

    await expect
      .poll(
        () =>
          rpcCalls.some(call => call.p_fields?.check_in_status === 'pulled'),
        { timeout: 20_000 }
      )
      .toBe(true);
    expect(rpcCalls.some(call => call.p_fields?.is_scored === true)).toBe(false);
  });

  test('reopens the saved dog for correction and keeps the next-dog shortcut explicit', async ({
    page,
  }) => {
    const rpcCalls: GuardedRingsideRpcCall[] = [];
    await installSharedStagingWriteGuard(page, { ringsideRpcCalls: rpcCalls, strictRpcWrites: true });

    await signInAsJudge(page, SCORE_PATH);
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('result-Q').click();
    await page.getByRole('button', { name: /^Save$/ }).click();
    await page.getByRole('button', { name: /Confirm & Submit/i }).click();
    await expect(page).toHaveURL(new RegExp(escapeRegExp(CLASS_PATH)), { timeout: 15_000 });

    await expect(page.getByRole('button', { name: 'Correct this score' })).toBeVisible();
    await expect(page.getByText('Or jump straight to whoever is at the gate:')).toBeVisible();
    await expect(page.getByTestId('quick-advance-entry').first()).toBeVisible();

    await page.getByRole('button', { name: 'Correct this score' }).click();
    await expect(page).toHaveURL(new RegExp(escapeRegExp(SCORE_PATH)));
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('result-NQ').click();
    await page.getByRole('button', { name: /^Save$/ }).click();
    await page.getByRole('button', { name: /Confirm & Submit/i }).click();
    await expect(page).toHaveURL(new RegExp(escapeRegExp(CLASS_PATH)), { timeout: 15_000 });

    await expect
      .poll(
        () =>
          rpcCalls.filter(
            call => call.p_entry_id === ENTRY_ID && call.p_fields?.is_scored === true
          ),
        { timeout: 20_000 }
      )
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            p_fields: expect.objectContaining({ result_status: 'qualified' }),
          }),
          expect.objectContaining({
            p_fields: expect.objectContaining({ result_status: 'nq' }),
          }),
        ])
      );
  });

  test('keeps a judge score durable offline and drains it exactly once after reconnect', async ({
    page,
    context,
  }) => {
    const rpcCalls: GuardedRingsideRpcCall[] = [];
    await installSharedStagingWriteGuard(page, { ringsideRpcCalls: rpcCalls, strictRpcWrites: true });

    await signInAsJudge(page, SCORE_PATH);
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 20_000 });

    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    await page.getByTestId('result-NQ').click();
    await page.getByRole('button', { name: /^Save$/ }).click();
    await page.getByRole('button', { name: /Confirm & Submit/i }).click();

    await expect(page).toHaveURL(new RegExp(escapeRegExp(CLASS_PATH)), { timeout: 15_000 });
    await expect
      .poll(() => readPendingMutationCount(page), { timeout: 10_000 })
      .toBeGreaterThan(0);
    await expect
      .poll(() => readEntryReplica(page), { timeout: 10_000 })
      .toMatchObject({
        syncStatus: 'pending',
        isDirty: true,
        data: expect.objectContaining({ result_status: 'nq', is_scored: true }),
      });
    await expect
      .poll(() => readPendingMutation(page, true), { timeout: 10_000 })
      .toMatchObject({
        tableName: 'entries',
        operation: 'UPDATE',
        rowId: ENTRY_ID,
        rpc: { name: 'ringside_update_entry' },
      });

    // Vite's development server intentionally disables the PWA shell, so a
    // hard reload cannot be completed while disconnected. Restore connectivity
    // first, then reload: the queued score must survive the restart and flush
    // through the same guarded RPC path.
    await expect.poll(() => readPendingMutationCount(page), { timeout: 10_000 }).toBeGreaterThan(0);

    await context.setOffline(false);
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true);
    await page.reload();
    await expect(page).toHaveURL(new RegExp(escapeRegExp(CLASS_PATH)));
    await page.evaluate(() => {
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await expect
      .poll(
        () =>
          rpcCalls.filter(
            call => call.p_entry_id === ENTRY_ID && call.p_fields?.is_scored === true
          ).length,
        { timeout: 20_000 }
      )
      .toBe(1);
    await expect.poll(() => readPendingMutation(page, true), { timeout: 20_000 }).toBeNull();
  });
});

async function readEntryReplica(page: Page) {
  return page.evaluate(
    ({ dbName, storeName, entryId }) =>
      new Promise<{
        syncStatus?: string;
        isDirty?: boolean;
        data?: Record<string, unknown>;
      } | null>(resolve => {
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
            const row = getReq.result as
              | {
                  syncStatus?: string;
                  isDirty?: boolean;
                  data?: Record<string, unknown>;
                }
              | undefined;
            db.close();
            resolve(row ? { syncStatus: row.syncStatus, isDirty: row.isDirty, data: row.data } : null);
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

async function readPendingMutationCount(page: Page) {
  return page.evaluate(
    ({ dbName, storeName }) =>
      new Promise<number>(resolve => {
        const openReq = indexedDB.open(dbName);
        openReq.onerror = () => resolve(0);
        openReq.onsuccess = () => {
          const db = openReq.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.close();
            resolve(0);
            return;
          }
          const countReq = db.transaction(storeName, 'readonly').objectStore(storeName).count();
          countReq.onsuccess = () => {
            db.close();
            resolve(countReq.result);
          };
          countReq.onerror = () => {
            db.close();
            resolve(0);
          };
        };
      }),
    { dbName: REPLICATION_DB_NAME, storeName: PENDING_MUTATIONS_STORE }
  );
}

async function readPendingMutation(page: Page, scoredOnly = false) {
  return page.evaluate(
    ({ dbName, storeName, entryId, scoredOnly }) =>
      new Promise<Record<string, unknown> | null>(resolve => {
        const openReq = indexedDB.open(dbName);
        openReq.onerror = () => resolve(null);
        openReq.onsuccess = () => {
          const db = openReq.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.close();
            resolve(null);
            return;
          }
          const getAllReq = db
            .transaction(storeName, 'readonly')
            .objectStore(storeName)
            .getAll();
          getAllReq.onsuccess = () => {
            const rows = getAllReq.result as Array<Record<string, unknown>>;
            db.close();
            resolve(
              rows.find(row => {
                if (row.rowId !== entryId) return false;
                if (!scoredOnly) return true;
                const rpc = row.rpc as { fields?: Record<string, unknown> } | undefined;
                return rpc?.fields?.is_scored === true;
              }) ?? null
            );
          };
          getAllReq.onerror = () => {
            db.close();
            resolve(null);
          };
        };
      }),
    {
      dbName: REPLICATION_DB_NAME,
      storeName: PENDING_MUTATIONS_STORE,
      entryId: ENTRY_ID,
      scoredOnly,
    }
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
