import { expect, test, type Page } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';
import {
  installSharedStagingWriteGuard,
  type GuardedRingsideRpcCall,
} from '../helpers/sharedStagingWriteGuard';
import {
  REPLICATION_DB_NAME,
  cleanupDisposableEntry,
  getIsolatedAdminClient,
  readReplicationStoreCount,
  seedDisposableEntry,
} from '../helpers/isolatedFixtures';

/**
 * Suite category: feature-audit.
 *
 * Offline round-trip guard for the at-show live scoresheet, run as the SECRETARY
 * (a show manager — the role the at-show data layer fully supports for read +
 * write). Creates a disposable entry in the Heartland Scent Work Classic demo
 * class. Shared staging writes remain intercepted, while isolated runs observe
 * the real ringside_update_entry RPC and verify persisted state before deleting
 * the disposable entry.
 *
 * (Previous Heritage fixture 3b91e282… was wiped from staging — "Ringside isn't
 * enabled" — so this moved to the stable Heartland demo show.)
 */

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';
const CLASS_ID = 'dec1a55e-0000-0000-0000-000000000032';
const TEMPLATE_ENTRY_ID = 'dededede-0000-0000-0000-000000000053';
const CLASS_PATH = `/at-show/${SHOW_ID}/class/${CLASS_ID}`;
// Mirrors REPLICATION_STORES in packages/replication/src/core/DatabaseManager.ts.
const REPLICATED_TABLES_STORE = 'replicated_tables';

test.describe('At-show offline scoring', () => {
  test('scores offline, queues the entry update, and flushes it after reconnect', async ({
    page,
    context,
  }) => {
    const seed = await seedDisposableEntry({
      showId: SHOW_ID,
      classId: CLASS_ID,
      templateEntryId: TEMPLATE_ENTRY_ID,
      label: 'Offline Score',
    });
    const scorePath = `/at-show/${SHOW_ID}/class/${CLASS_ID}/score/${seed.entryId}`;
    const rpcCalls: GuardedRingsideRpcCall[] = [];

    try {
      await installSharedStagingWriteGuard(page, {
        ringsideRpcCalls: rpcCalls,
      });
      await signInAsSecretary(page, scorePath);
      await expect(page).toHaveURL(new RegExp(escapeRegExp(scorePath)));
      await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 20_000 });

      await expect.poll(() => readEntryReplica(page, seed.entryId)).not.toBeNull();

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
      await expect
        .poll(() => readReplicationStoreCount(page, 'pending_mutations'), { timeout: 10_000 })
        .toBeGreaterThan(0);
      await expect
        .poll(() => readEntryReplica(page, seed.entryId), { timeout: 10_000 })
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
              call =>
                call.p_entry_id === seed.entryId && call.p_fields?.result_status === 'qualified'
            ),
          { timeout: 20_000 }
        )
        .toBe(true);
      await expect.poll(() => readReplicationStoreCount(page, 'pending_mutations'), { timeout: 20_000 }).toBe(0);
      await expect
        .poll(() => readPersistedScoringState(seed.entryId), { timeout: 20_000 })
        .toEqual({ is_scored: true, result_status: 'qualified' });
    } finally {
      try {
        await context.setOffline(false);
      } finally {
        await cleanupDisposableEntry(seed);
      }
    }
  });
});

interface PersistedScoringState {
  is_scored: boolean;
  result_status: string | null;
}

async function readPersistedScoringState(entryId: string): Promise<PersistedScoringState> {
  const client = getIsolatedAdminClient();
  const { data, error } = await client
    .from('entries')
    .select('is_scored, result_status')
    .eq('id', entryId)
    .single();
  if (error || !data) {
    throw new Error(`Could not read isolated scoring state: ${error?.message ?? 'missing entry'}`);
  }
  return data;
}

async function readEntryReplica(page: Page, entryId: string) {
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
    { dbName: REPLICATION_DB_NAME, storeName: REPLICATED_TABLES_STORE, entryId }
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
