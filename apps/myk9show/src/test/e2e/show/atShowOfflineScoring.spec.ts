import { expect, test, type Page, type Route } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';

/**
 * Suite category: feature-audit.
 *
 * Offline round-trip guard for the at-show live scoresheet. The spec reuses a
 * stable Heritage fixture from shared staging seed data instead of creating live
 * rows, then intercepts entry PATCH uploads so reconnect verification never
 * mutates the shared Supabase project. If the fixture is rebuilt, update the
 * show/class/entry IDs together.
 */

const SHOW_ID = '3b91e282-6e45-4a89-9446-f6ebeb0bf62c';
const CLASS_ID = 'ff0b5419-3e12-4bf5-96e4-40e8e297989f';
const ENTRY_ID = '206c4806-e757-4f00-a2eb-250c6ba468bb';
const SCORE_PATH = `/at-show/${SHOW_ID}/class/${CLASS_ID}/score/${ENTRY_ID}`;
const CLASS_PATH = `/at-show/${SHOW_ID}/class/${CLASS_ID}`;
// Mirrors @myk9/replication constants: DB_NAME in packages/replication/src/constants.ts
// and REPLICATION_STORES in packages/replication/src/core/DatabaseManager.ts.
const REPLICATION_DB_NAME = 'myK9_Replication';
const REPLICATED_TABLES_STORE = 'replicated_tables';
const PENDING_MUTATIONS_STORE = 'pending_mutations';

type PatchPayload = Record<string, unknown>;
type EntryPatchPayload = PatchPayload & { id: string };

test.describe('At-show offline scoring', () => {
  test('scores offline, queues the entry update, and flushes it after reconnect', async ({
    page,
    context,
  }) => {
    const entryPatches: EntryPatchPayload[] = [];
    await interceptEntryUploads(page, entryPatches);

    await signInAsSecretary(page, SCORE_PATH);
    await expect(page).toHaveURL(new RegExp(escapeRegExp(SCORE_PATH)));
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 20_000 });

    await expect.poll(() => readEntryReplica(page)).not.toBeNull();

    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    await page.getByTestId('result-Q').click();
    await page.getByRole('button', { name: /^Save$/ }).click();
    await page.getByRole('button', { name: /Confirm & Submit/i }).click();

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
          entryPatches.some(patch => patch.id === ENTRY_ID && patch.result_status === 'qualified'),
        { timeout: 20_000 }
      )
      .toBe(true);
    await expect.poll(() => readPendingMutationCount(page), { timeout: 20_000 }).toBe(0);
  });
});

async function interceptEntryUploads(page: Page, entryPatches: EntryPatchPayload[]) {
  await page.route('**/rest/v1/entries?*', async (route: Route) => {
    const request = route.request();
    if (request.method() !== 'PATCH') {
      await route.continue();
      return;
    }

    const patch = request.postDataJSON() as unknown;
    if (!isEntryPatchPayload(patch)) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: `Unexpected entries PATCH payload for ${ENTRY_ID}` }),
      });
      return;
    }

    entryPatches.push(patch);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: patch.id, version: 100 + entryPatches.length }]),
    });
  });
}

function isEntryPatchPayload(value: unknown): value is EntryPatchPayload {
  return typeof value === 'object' && value !== null && (value as { id?: unknown }).id === ENTRY_ID;
}

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
