import { expect, test, type Page } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';
import {
  installSharedStagingWriteGuard,
  isIsolatedSupabaseTarget,
  type GuardedRingsideRpcCall,
} from '../helpers/sharedStagingWriteGuard';

/**
 * Suite category: feature-audit.
 *
 * Multi-device offline conflict (MYK9-42, MYK9-1487). Two independent devices
 * (two Playwright browser contexts, each with its own IndexedDB replica and
 * session) score the *same* entry while offline, then reconnect one after the
 * other. This is the multi-device case the offline-first design exists for.
 *
 * What this proves, end to end against an isolated stack:
 *   1. Device A reconnects first and its write lands on the server.
 *   2. Device B reconnects second. Its queued write carries a stale OCC token,
 *      so the server genuinely rejects it (40001) and the app parks the row as
 *      a conflict instead of overwriting A's score. B's user sees the
 *      "This record was changed elsewhere" notice (ReplicationSyncProvider).
 *   3. B's user resolves it with "Take theirs". B's queue drains to 0 and both
 *      devices hold the same final result (A's).
 *
 * The write guard (`installSharedStagingWriteGuard`) still protects shared
 * staging, but on an isolated host (127.0.0.1) it records and FORWARDS
 * `ringside_update_entry` (`isObservableIsolatedRingsideWrite`), so the
 * conflict here is the server's own, not a simulated one. The unit-level merge
 * rules stay in packages/replication/src/conflict/*.
 *
 * Scope: runs in the chromium project only, with retries off. Every project
 * would score the same seeded entry (...051) concurrently, and a retry would
 * start from the previous attempt's scored entry, so neither is deterministic
 * (MYK9-1487). Replication conflict handling is browser-agnostic app logic, so
 * one project is sufficient coverage. It also skips unless the target is an
 * isolated host: on shared staging the write guard answers both devices with
 * synthetic success, so B never receives the server's OCC rejection.
 *
 * Fixture: entry ...051 (Willow, Container Novice A) - confirmed/paid, and not
 * used by atShowOfflineScoring.spec.ts (...053) or atShowJudgeScoring.spec.ts
 * (...052). The spec scores it once and leaves it scored.
 */

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';
const CLASS_ID = 'dec1a55e-0000-0000-0000-000000000031';
const ENTRY_ID = 'dededede-0000-0000-0000-000000000051';
const SCORE_PATH = `/at-show/${SHOW_ID}/class/${CLASS_ID}/score/${ENTRY_ID}`;
const CLASS_PATH = `/at-show/${SHOW_ID}/class/${CLASS_ID}`;
const REPLICATION_DB_NAME = 'myK9_Replication';
const PENDING_MUTATIONS_STORE = 'pending_mutations';

const CONFLICT_TITLE = 'This record was changed elsewhere';

test.describe('At-show multi-device offline conflict', () => {
  test.describe.configure({ retries: 0 });

  test('second device to reconnect gets a conflict notice, and Take theirs settles both devices on the first score', async ({
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'shares one seeded entry; see MYK9-1487');
    test.skip(
      !isIsolatedSupabaseTarget(process.env.VITE_SUPABASE_URL),
      'needs an isolated host: the shared-staging write guard returns synthetic success, so no real OCC conflict'
    );
    test.setTimeout(180_000);
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const deviceA = await contextA.newPage();
    const deviceB = await contextB.newPage();

    try {
      const rpcCallsA: GuardedRingsideRpcCall[] = [];
      const rpcCallsB: GuardedRingsideRpcCall[] = [];
      await installSharedStagingWriteGuard(deviceA, { ringsideRpcCalls: rpcCallsA });
      await installSharedStagingWriteGuard(deviceB, { ringsideRpcCalls: rpcCallsB });

      await signInAsSecretary(deviceA, SCORE_PATH);
      await signInAsSecretary(deviceB, SCORE_PATH);
      for (const device of [deviceA, deviceB]) {
        await expect(device.getByRole('button', { name: /^Save$/ })).toBeVisible({
          timeout: 20_000,
        });
      }

      await contextA.setOffline(true);
      await contextB.setOffline(true);
      await deviceA.evaluate(() => window.dispatchEvent(new Event('offline')));
      await deviceB.evaluate(() => window.dispatchEvent(new Event('offline')));

      // Deliberately different scores from the two devices.
      await scoreOffline(deviceA, 'Q');
      await scoreOffline(deviceB, 'NQ');
      await expect
        .poll(() => readPendingMutationCount(deviceA), { timeout: 10_000 })
        .toBeGreaterThan(0);
      await expect
        .poll(() => readPendingMutationCount(deviceB), { timeout: 10_000 })
        .toBeGreaterThan(0);

      // Device A reconnects alone: its write lands, nothing to conflict with.
      await contextA.setOffline(false);
      await deviceA.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect.poll(() => readPendingMutationCount(deviceA), { timeout: 30_000 }).toBe(0);
      expect(
        rpcCallsA.some(
          call => call.p_entry_id === ENTRY_ID && call.p_fields?.result_status === 'qualified'
        )
      ).toBe(true);
      await expect(deviceA.getByText(CONFLICT_TITLE)).toHaveCount(0);

      // Device B reconnects second: its stale-token write is rejected by the
      // server and the app asks its user instead of overwriting A.
      await contextB.setOffline(false);
      await deviceB.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect(deviceB.getByText(CONFLICT_TITLE)).toBeVisible({ timeout: 30_000 });
      expect(rpcCallsB.some(call => call.p_entry_id === ENTRY_ID)).toBe(true);
      // Parked, not dropped: B's queue still holds its writes until the user chooses.
      expect(await readPendingMutationCount(deviceB)).toBeGreaterThan(0);

      await deviceB.getByRole('button', { name: 'Take theirs' }).click();
      await expect(deviceB.getByText(CONFLICT_TITLE)).toHaveCount(0);
      await expect.poll(() => readPendingMutationCount(deviceB), { timeout: 30_000 }).toBe(0);
      await expect.poll(() => readPendingMutationCount(deviceA), { timeout: 10_000 }).toBe(0);

      // Both replicas now agree on A's score.
      await expect.poll(() => readEntryResult(deviceB), { timeout: 20_000 }).toBe('qualified');
      expect(await readEntryResult(deviceA)).toBe('qualified');
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});

async function scoreOffline(device: Page, result: 'Q' | 'NQ') {
  await device.getByTestId(`result-${result}`).click();
  await device.getByRole('button', { name: /^Save$/ }).click();
  await device.getByRole('button', { name: /Confirm & Submit/i }).click();
  await expect(device).toHaveURL(new RegExp(escapeRegExp(CLASS_PATH)), { timeout: 15_000 });
}

async function readEntryResult(page: Page) {
  return page.evaluate(
    ({ dbName, entryId }) =>
      new Promise<string | null>(resolve => {
        const openReq = indexedDB.open(dbName);
        openReq.onerror = () => resolve(null);
        openReq.onsuccess = () => {
          const db = openReq.result;
          if (!db.objectStoreNames.contains('replicated_tables')) {
            db.close();
            resolve(null);
            return;
          }
          const getReq = db
            .transaction('replicated_tables', 'readonly')
            .objectStore('replicated_tables')
            .get(['entries', entryId]);
          getReq.onsuccess = () => {
            db.close();
            const data = getReq.result?.data as { result_status?: string | null } | undefined;
            resolve(data?.result_status ?? null);
          };
          getReq.onerror = () => {
            db.close();
            resolve(null);
          };
        };
      }),
    { dbName: REPLICATION_DB_NAME, entryId: ENTRY_ID }
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
