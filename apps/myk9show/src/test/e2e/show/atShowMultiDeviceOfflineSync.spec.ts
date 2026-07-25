import { expect, test, type Page } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';
import {
  installSharedStagingWriteGuard,
  type GuardedRingsideRpcCall,
} from '../helpers/sharedStagingWriteGuard';

/**
 * Suite category: feature-audit.
 *
 * Multi-device offline sync-merge (MYK9-42). Models two independent devices
 * (two isolated Playwright browser contexts, each with its own IndexedDB
 * replica and localStorage session) both scoring the *same* entry while
 * offline, then both reconnecting close together. This is the natural
 * extension of show/atShowOfflineScoring.spec.ts (single-device round trip)
 * to the multi-device case the offline-first design exists for.
 *
 * Scope: this proves the sync-merge round trip doesn't deadlock or drop a
 * mutation when two devices flush near-simultaneously — it does NOT exercise
 * server-side optimistic-concurrency rejection (the real "40001 conflict"
 * class documented in packages/replication/src/conflict/*, which is unit
 * -tested there with a real version-mismatch response). Reproducing that
 * precisely at the browser layer would require matching the live RPC's actual
 * conflict-error shape; each device's ringside_update_entry call is
 * intercepted (installSharedStagingWriteGuard) so the shared staging entry is
 * never actually mutated by this spec, which also means both intercepted
 * calls unconditionally "succeed" — a true conflict-rejection path stays a
 * unit-test concern.
 *
 * Fixture: entry ...051 (Willow, Container Novice A) — confirmed/paid, and not
 * used by atShowOfflineScoring.spec.ts (...053) or atShowJudgeScoring.spec.ts
 * (...052), so the three specs can run in parallel without racing on IndexedDB
 * state for the same entry.
 */

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';
const CLASS_ID = 'dec1a55e-0000-0000-0000-000000000031';
const ENTRY_ID = 'dededede-0000-0000-0000-000000000051';
const SCORE_PATH = `/at-show/${SHOW_ID}/class/${CLASS_ID}/score/${ENTRY_ID}`;
const CLASS_PATH = `/at-show/${SHOW_ID}/class/${CLASS_ID}`;
const REPLICATION_DB_NAME = 'myK9_Replication';
const PENDING_MUTATIONS_STORE = 'pending_mutations';

test.describe('At-show multi-device offline sync-merge', () => {
  test('two devices score the same entry offline and both flush cleanly on reconnect', async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const deviceA = await contextA.newPage();
    const deviceB = await contextB.newPage();

    try {
      const rpcCallsA: GuardedRingsideRpcCall[] = [];
      const rpcCallsB: GuardedRingsideRpcCall[] = [];
      await installSharedStagingWriteGuard(deviceA, {
        ringsideRpcCalls: rpcCallsA,
        versionBase: 100,
      });
      await installSharedStagingWriteGuard(deviceB, {
        ringsideRpcCalls: rpcCallsB,
        versionBase: 200,
      });

      await signInAsSecretary(deviceA, SCORE_PATH);
      await signInAsSecretary(deviceB, SCORE_PATH);
      await expect(deviceA.getByRole('button', { name: /^Save$/ })).toBeVisible({
        timeout: 20_000,
      });
      await expect(deviceB.getByRole('button', { name: /^Save$/ })).toBeVisible({
        timeout: 20_000,
      });

      // Both devices go offline independently (two separate BrowserContexts,
      // so each has its own network/IndexedDB state).
      await contextA.setOffline(true);
      await contextB.setOffline(true);
      await deviceA.evaluate(() => window.dispatchEvent(new Event('offline')));
      await deviceB.evaluate(() => window.dispatchEvent(new Event('offline')));

      // Deliberately conflicting scores from the two devices.
      await deviceA.getByTestId('result-Q').click();
      await deviceA.getByRole('button', { name: /^Save$/ }).click();
      await deviceA.getByRole('button', { name: /Confirm & Submit/i }).click();
      await expect(deviceA).toHaveURL(new RegExp(escapeRegExp(CLASS_PATH)), { timeout: 15_000 });

      await deviceB.getByTestId('result-NQ').click();
      await deviceB.getByRole('button', { name: /^Save$/ }).click();
      await deviceB.getByRole('button', { name: /Confirm & Submit/i }).click();
      await expect(deviceB).toHaveURL(new RegExp(escapeRegExp(CLASS_PATH)), { timeout: 15_000 });

      await expect
        .poll(() => readPendingMutationCount(deviceA), { timeout: 10_000 })
        .toBeGreaterThan(0);
      await expect
        .poll(() => readPendingMutationCount(deviceB), { timeout: 10_000 })
        .toBeGreaterThan(0);

      // Reconnect both devices close together.
      await contextA.setOffline(false);
      await contextB.setOffline(false);
      await deviceA.evaluate(() => window.dispatchEvent(new Event('online')));
      await deviceB.evaluate(() => window.dispatchEvent(new Event('online')));

      // Neither device's mutation queue should stall — both drain even though
      // they raced to sync the same entry.
      await expect.poll(() => readPendingMutationCount(deviceA), { timeout: 20_000 }).toBe(0);
      await expect.poll(() => readPendingMutationCount(deviceB), { timeout: 20_000 }).toBe(0);

      // Each device's own write actually reached the (intercepted) RPC — the
      // reconnect flush isn't silently discarding one device's queue.
      expect(rpcCallsA.some(call => call.p_entry_id === ENTRY_ID)).toBe(true);
      expect(rpcCallsB.some(call => call.p_entry_id === ENTRY_ID)).toBe(true);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});

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
