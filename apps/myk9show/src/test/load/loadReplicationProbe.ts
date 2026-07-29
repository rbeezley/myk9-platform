import { SYNC_INTERVAL_MS } from '@myk9/replication';
import type { Page } from '@playwright/test';

const REPLICATION_DB_NAME = 'myK9_Replication';
const PENDING_MUTATIONS_STORE = 'pending_mutations';
const QUEUE_DRAIN_TIMEOUT_MS = SYNC_INTERVAL_MS + 30_000;
const QUEUE_PROBE_TIMEOUT_MS = 2_000;

export async function waitForQueueDrain(page: Page): Promise<void> {
  const deadline = Date.now() + QUEUE_DRAIN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if ((await readPendingMutationCount(page)) === 0) return;
    await delay(500);
  }
}

export async function readPendingMutationCount(page: Page): Promise<number> {
  const deadline = Date.now() + 20_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    if (page.isClosed()) throw new Error('Cannot read replication queue from a closed page.');
    try {
      return await evaluatePendingMutationCount(page);
    } catch (error) {
      lastError = error;
      await page.waitForLoadState('domcontentloaded', { timeout: 2_000 }).catch(() => undefined);
      await delay(100);
    }
  }

  throw new Error('Could not read the replication queue after navigation settled.', {
    cause: lastError,
  });
}

async function evaluatePendingMutationCount(page: Page): Promise<number> {
  return page.evaluate(
    ({ dbName, storeName, timeoutMs }) =>
      new Promise<number>((resolve, reject) => {
        let settled = false;
        const timeout = window.setTimeout(() => {
          settled = true;
          reject(new Error('Replication queue probe timed out.'));
        }, timeoutMs);
        const succeed = (value: number) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          resolve(value);
        };
        const fail = (message: string) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          reject(new Error(message));
        };
        const request = indexedDB.open(dbName);
        request.onerror = () => fail('Replication queue database could not be opened.');
        request.onblocked = () => fail('Replication queue database open was blocked.');
        request.onsuccess = () => {
          const db = request.result;
          if (settled) {
            db.close();
            return;
          }
          if (!db.objectStoreNames.contains(storeName)) {
            db.close();
            succeed(0);
            return;
          }
          const count = db.transaction(storeName, 'readonly').objectStore(storeName).count();
          count.onsuccess = () => {
            db.close();
            succeed(count.result);
          };
          count.onerror = () => {
            db.close();
            fail('Replication queue count failed.');
          };
        };
      }),
    {
      dbName: REPLICATION_DB_NAME,
      storeName: PENDING_MUTATIONS_STORE,
      timeoutMs: QUEUE_PROBE_TIMEOUT_MS,
    }
  );
}

export async function waitForReplicatedEntry(
  page: Page,
  entryId: string,
  expectedClassId: string
): Promise<void> {
  await page.waitForFunction(
    ({ dbName, entryId, expectedClassId }) =>
      new Promise<boolean>(resolve => {
        const request = indexedDB.open(dbName);
        request.onerror = () => resolve(false);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('replicated_tables')) {
            db.close();
            resolve(false);
            return;
          }
          const entry = db
            .transaction('replicated_tables', 'readonly')
            .objectStore('replicated_tables')
            .get(['entries', entryId]);
          entry.onsuccess = () => {
            db.close();
            const result = entry.result as
              { data?: { classId?: string; class_id?: string } } | undefined;
            resolve((result?.data?.classId ?? result?.data?.class_id) === expectedClassId);
          };
          entry.onerror = () => {
            db.close();
            resolve(false);
          };
        };
      }),
    { dbName: REPLICATION_DB_NAME, entryId, expectedClassId },
    { timeout: 90_000 }
  );
}

export async function waitForReplicatedEntrySync(
  page: Page,
  showId: string,
  expectedCount: number
): Promise<void> {
  await page.waitForFunction(
    ({ dbName, showId, expectedCount }) =>
      new Promise<boolean>(resolve => {
        const request = indexedDB.open(dbName);
        request.onerror = () => resolve(false);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('sync_metadata')) {
            db.close();
            resolve(false);
            return;
          }
          const metadata = db
            .transaction('sync_metadata', 'readonly')
            .objectStore('sync_metadata')
            .get('entries');
          metadata.onsuccess = () => {
            db.close();
            const result = metadata.result as
              | {
                  syncStatus?: string;
                  scopes?: Record<string, { totalRows?: number }>;
                }
              | undefined;
            resolve(
              result?.syncStatus === 'idle' && result.scopes?.[showId]?.totalRows === expectedCount
            );
          };
          metadata.onerror = () => {
            db.close();
            resolve(false);
          };
        };
      }),
    { dbName: REPLICATION_DB_NAME, showId, expectedCount },
    { timeout: 90_000 }
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}
