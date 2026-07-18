import { expect, test, type Page } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';
import {
  installSharedStagingWriteGuard,
  type GuardedRingsideRpcCall,
} from '../helpers/sharedStagingWriteGuard';

/**
 * Suite category: feature-audit.
 *
 * Offline round-trip guard for the at-show live scoresheet, run as the SECRETARY
 * (a show manager — the role the at-show data layer fully supports for read +
 * write). Reuses the Heartland Scent Work Classic demo seed instead of creating
 * live rows, then intercepts the ringside_update_entry RPC (the routed sync
 * target for ringside-column writes — PR #886) so reconnect verification never
 * mutates the shared Supabase project. If the seed is rebuilt, update the
 * show/class/entry IDs together.
 *
 * (Previous Heritage fixture 3b91e282… was wiped from staging — "Ringside isn't
 * enabled" — so this moved to the stable Heartland demo show.)
 */

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';
const CLASS_ID = 'dec1a55e-0000-0000-0000-000000000032';
const ENTRY_ID = 'dededede-0000-0000-0000-000000000053';
const SCORE_PATH = `/at-show/${SHOW_ID}/class/${CLASS_ID}/score/${ENTRY_ID}`;
const CLASS_PATH = `/at-show/${SHOW_ID}/class/${CLASS_ID}`;
// Mirrors @myk9/replication constants: DB_NAME in packages/replication/src/constants.ts
// and REPLICATION_STORES in packages/replication/src/core/DatabaseManager.ts.
const REPLICATION_DB_NAME = 'myK9_Replication';
const REPLICATED_TABLES_STORE = 'replicated_tables';
const PENDING_MUTATIONS_STORE = 'pending_mutations';

test.describe('At-show offline scoring', () => {
  test('scores offline, queues the entry update, and flushes it after reconnect', async ({
    page,
    context,
  }) => {
    const rpcCalls: GuardedRingsideRpcCall[] = [];
    await installSharedStagingWriteGuard(page, { ringsideRpcCalls: rpcCalls });

    await signInAsSecretary(page, SCORE_PATH);
    await expect(page).toHaveURL(new RegExp(escapeRegExp(SCORE_PATH)));
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 20_000 });

    await expect.poll(() => readEntryReplica(page)).not.toBeNull();

    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    await page.getByTestId('result-Q').click();
    const saveButton = page.getByRole('button', { name: /^Save$/ });
    await expect(saveButton).toBeEnabled();
    // Offline transitions keep the scoresheet in a short layout animation.
    // Assert actionability, then avoid waiting for an impossible network
    // navigation while dispatching the already-visible click.
    await saveButton.evaluate(button => (button as HTMLButtonElement).click());

    const confirmButton = page.getByRole('button', { name: /Confirm & Submit/i });
    await expect(confirmButton).toBeEnabled();
    await confirmButton.evaluate(button => (button as HTMLButtonElement).click());

    await expect(page).toHaveURL(new RegExp(escapeRegExp(CLASS_PATH)), { timeout: 15_000 });
    await expect.poll(() => readPendingMutationCount(page), { timeout: 10_000 }).toBeGreaterThan(0);
    await expect
      .poll(() => readEntryReplica(page), { timeout: 10_000 })
      .toMatchObject({
        syncStatus: 'pending',
        isDirty: true,
        data: expect.objectContaining({
          result_status: 'qualified',
          is_scored: true,
        }),
      });

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    await expect
      .poll(
        () =>
          rpcCalls.some(
            call => call.p_entry_id === ENTRY_ID && call.p_fields?.result_status === 'qualified'
          ),
        { timeout: 20_000 }
      )
      .toBe(true);
    await expect.poll(() => readPendingMutationCount(page), { timeout: 20_000 }).toBe(0);
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
            resolve(
              row ? { syncStatus: row.syncStatus, isDirty: row.isDirty, data: row.data } : null
            );
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
