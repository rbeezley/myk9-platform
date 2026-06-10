import { expect, test, type Page } from '@playwright/test';
import { signIn } from '../uat/shared/auth';
import { TEST_USERS } from '../helpers/testUsers';

/**
 * Suite category: replication / conflict-surfacing (Phase 4).
 *
 * Covers the offline conflict-surfacing feature shipped in PRs #602–#604 behind
 * `features.showConflictSurfacing` / `VITE_SHOW_CONFLICT_SURFACING`. The runtime
 * contract under test lives in `apps/myk9show/src/providers/ReplicationSyncProvider.tsx`:
 *
 *   - The shared replication chokepoint detects a same-field dirty-row collision and
 *     dispatches a `replication:conflict` window CustomEvent (see
 *     `packages/replication/src/syncReplicatedTable.ts`).
 *   - `ReplicationSyncProvider` listens for that event and surfaces a *persistent*
 *     Sonner toast: title "This record was changed elsewhere", `action` button
 *     "Take theirs" and `cancel` button "Keep mine".
 *   - "Keep mine"  -> `table.resolveReplicationConflict(rowId, 'keep-local')`  (clears the
 *                     conflict, row goes back to `syncStatus: 'pending'`, the queued
 *                     mutation re-uploads with the corrected OCC server version).
 *   - "Take theirs" -> `table.resolveReplicationConflict(rowId, 'take-remote')` +
 *                     `mutationManager.discardPendingMutationsForRow(...)` (local row is
 *                     replaced with the remote value, marked `synced`, pending mutation
 *                     dropped).
 *
 * ── Why synthetic dispatch instead of full two-context offline simulation ──
 *
 * The prompt allows a documented synthetic fallback when full cross-context offline
 * simulation is infeasible "within reason", and a passing meaningful spec is preferred
 * over a flaky full-offline one. Full simulation is not viable here because:
 *
 *   1. The OCC mutation-hold (plan Task 4) was *descoped* in #602, so a conflicted row
 *      is not deterministically held; reproducing the exact base/local/remote divergence
 *      requires a real Realtime + Supabase round-trip between two IndexedDB replicas.
 *   2. Playwright route-blocking one context offline cannot make the *other* context's
 *      server write produce a deterministic same-field `baseData`/`remoteData` divergence
 *      in the first context's replica inside a bounded, non-flaky test window.
 *   3. The feature's own pre-enablement validation (plan §"Manual validation") used a
 *      synthetic `replication:conflict` dispatch to confirm the toast + resolution.
 *
 * This spec exercises the *real shipped runtime end to end*: it runs in two real
 * authenticated browser contexts, seeds a genuine conflicted row into the real
 * `myK9_Replication` IndexedDB, dispatches the real `replication:conflict` event,
 * asserts the real Sonner toast from the real provider, and — crucially — reads the
 * IndexedDB row back after each resolution so the assertion proves
 * `resolveReplicationConflict` mutated genuinely persisted state, not a mock.
 *
 * ── Scope: what this does and does NOT cover ──
 *
 *   - The two contexts are INDEPENDENT. Each seeds + dispatches + resolves against its
 *     own isolated IndexedDB; no data crosses A ↔ B and there is no cross-replica
 *     round-trip (that would need the descoped OCC hold, above). The two contexts exist
 *     only to run the two resolution branches — keep-local in A, take-remote in B — in
 *     genuinely separate browser sessions, NOT to test replication between them.
 *   - Flag-gating is OUT OF SCOPE. The toast handler in `ReplicationSyncProvider` listens
 *     unconditionally; only the detection/dispatch site is gated by
 *     `isConflictSurfacingEnabled()` (syncReplicatedTable.ts), covered by its own unit
 *     test. Because this spec dispatches `replication:conflict` by hand it bypasses that
 *     gate — it asserts the toast + both resolver branches, not the flag.
 *   - The Heritage show route is incidental: it only mounts the provider after login; no
 *     show data is read, so this is not a cross-show assertion.
 *
 * To run:
 *   cd apps/myk9show
 *   pnpm test:e2e:clean src/test/e2e/show/showConflictSurfacing.spec.ts --project=chromium --workers=1
 */

const SHOW_ID = '3b91e282-6e45-4a89-9446-f6ebeb0bf62c'; // Heritage fixture show
const SHOW_ROUTE = `/shows/${SHOW_ID}`;

// IndexedDB coordinates for the replication layer. Mirrors
// packages/replication/src/constants.ts (DB_NAME) and
// packages/replication/src/core/DatabaseManager.ts (REPLICATED_TABLES store,
// keyPath ['tableName','id']). The DB is opened *without* a version in-page so the
// spec stays version-agnostic if DB_VERSION bumps.
const REPLICATION_DB_NAME = 'myK9_Replication';
const REPLICATED_TABLES_STORE = 'replicated_tables';
const CONFLICT_TABLE = 'entries';

const TOAST_TITLE = 'This record was changed elsewhere';

interface SeededConflict {
  rowId: string;
  field: string;
  localValue: string;
  remoteValue: string;
  baseValue: string;
}

/**
 * Seed a single conflicted row directly into the real replication IndexedDB so the
 * shipped resolution APIs operate on genuinely persisted state. Returns false if the
 * replication store hasn't been created yet (provider not mounted), so callers can
 * surface a clear failure rather than a silent no-op.
 */
async function seedConflictRow(page: Page, conflict: SeededConflict): Promise<boolean> {
  return page.evaluate(
    ({ dbName, storeName, tableName, c }) =>
      new Promise<boolean>(resolve => {
        const openReq = indexedDB.open(dbName); // no version -> attach to existing DB
        openReq.onerror = () => resolve(false);
        openReq.onsuccess = () => {
          const db = openReq.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.close();
            resolve(false);
            return;
          }
          const snapshot = {
            tableName,
            rowId: c.rowId,
            fields: [c.field],
            localData: { id: c.rowId, [c.field]: c.localValue },
            remoteData: { id: c.rowId, [c.field]: c.remoteValue },
            baseData: { id: c.rowId, [c.field]: c.baseValue },
            baseVersion: 1,
            localVersion: 2,
            remoteServerVersion: 7,
            detectedAt: Date.now(),
          };
          const row = {
            tableName,
            id: c.rowId,
            data: { id: c.rowId, [c.field]: c.localValue },
            version: 2,
            serverVersion: 1,
            lastSyncedAt: Date.now(),
            lastAccessedAt: Date.now(),
            accessCount: 0,
            lastModifiedAt: Date.now(),
            isDirty: true,
            syncStatus: 'conflict',
            baseData: { id: c.rowId, [c.field]: c.baseValue },
            baseVersion: 1,
            conflict: snapshot,
          };
          const tx = db.transaction(storeName, 'readwrite');
          tx.objectStore(storeName).put(row);
          tx.oncomplete = () => {
            db.close();
            resolve(true);
          };
          tx.onerror = () => {
            db.close();
            resolve(false);
          };
        };
      }),
    { dbName: REPLICATION_DB_NAME, storeName: REPLICATED_TABLES_STORE, tableName: CONFLICT_TABLE, c: conflict }
  );
}

/** Read back the persisted row for resolution assertions. */
async function readConflictRow(
  page: Page,
  rowId: string
): Promise<{ syncStatus?: string; isDirty?: boolean; data?: Record<string, unknown>; hasConflict: boolean } | null> {
  return page.evaluate(
    ({ dbName, storeName, tableName, id }) =>
      new Promise<{
        syncStatus?: string;
        isDirty?: boolean;
        data?: Record<string, unknown>;
        hasConflict: boolean;
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
          const tx = db.transaction(storeName, 'readonly');
          const getReq = tx.objectStore(storeName).get([tableName, id]);
          getReq.onsuccess = () => {
            const row = getReq.result as
              | {
                  syncStatus?: string;
                  isDirty?: boolean;
                  data?: Record<string, unknown>;
                  conflict?: unknown;
                }
              | undefined;
            db.close();
            resolve(
              row
                ? {
                    syncStatus: row.syncStatus,
                    isDirty: row.isDirty,
                    data: row.data,
                    hasConflict: row.conflict !== undefined,
                  }
                : null
            );
          };
          getReq.onerror = () => {
            db.close();
            resolve(null);
          };
        };
      }),
    { dbName: REPLICATION_DB_NAME, storeName: REPLICATED_TABLES_STORE, tableName: CONFLICT_TABLE, id: rowId }
  );
}

/** Dispatch the real `replication:conflict` event the shipped chokepoint emits. */
async function dispatchConflict(page: Page, conflict: SeededConflict): Promise<void> {
  await page.evaluate(
    ({ tableName, c }) => {
      window.dispatchEvent(
        new CustomEvent('replication:conflict', {
          detail: {
            tableName,
            rowId: c.rowId,
            fields: [c.field],
            localData: { id: c.rowId, [c.field]: c.localValue },
            remoteData: { id: c.rowId, [c.field]: c.remoteValue },
            baseData: { id: c.rowId, [c.field]: c.baseValue },
            baseVersion: 1,
            localVersion: 2,
            remoteServerVersion: 7,
            detectedAt: Date.now(),
          },
        })
      );
    },
    { tableName: CONFLICT_TABLE, c: conflict }
  );
}

test.describe('Show conflict surfacing — toast + both resolution branches persist', () => {
  test.describe.configure({ timeout: 120_000 });

  test('conflict toast surfaces and keep-local / take-remote each persist correctly', async ({
    browser,
  }) => {
    // Two INDEPENDENT browser contexts (separate IndexedDB/storage). They do not
    // interact — each runs one resolution branch end to end against its own replica
    // (keep-local in A, take-remote in B). Per the header "Scope" note, this is not a
    // cross-replica round-trip; the two roles just exercise both branches in separate
    // browser sessions.
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    try {
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      // Sign in directly INTO the show route (returnTo) so post-login replication/RBAC
      // requests are not aborted by a follow-up navigation.
      await signIn(pageA, TEST_USERS.SECRETARY.email, TEST_USERS.SECRETARY.password, SHOW_ROUTE);
      await signIn(pageB, TEST_USERS.EXHIBITOR.email, TEST_USERS.EXHIBITOR.password, SHOW_ROUTE);

      // Wait until the replication store exists in each context (provider mounted +
      // IndexedDB schema created) before seeding. Poll the seed, which no-ops false
      // until the store is ready.
      const rowId = `e2e-conflict-${Date.now()}`;
      const conflict: SeededConflict = {
        rowId,
        field: 'check_in_status',
        localValue: 'checked-in',
        remoteValue: 'absent',
        baseValue: 'no-status',
      };

      await expect
        .poll(() => seedConflictRow(pageA, conflict), { timeout: 30_000, intervals: [1000] })
        .toBe(true);
      await expect
        .poll(() => seedConflictRow(pageB, conflict), { timeout: 30_000, intervals: [1000] })
        .toBe(true);

      // ── Context A: surface the conflict, resolve "Keep mine" ──────────────────────
      await dispatchConflict(pageA, conflict);

      const toastA = pageA.getByText(TOAST_TITLE, { exact: false });
      await expect(toastA).toBeVisible({ timeout: 15_000 });
      // The shipped toast spells out the changed field(s).
      await expect(pageA.getByText(/check_in_status/i)).toBeVisible();
      await expect(pageA.getByRole('button', { name: /Take theirs/i })).toBeVisible();
      await expect(pageA.getByRole('button', { name: /Keep mine/i })).toBeVisible();

      // "Keep mine" -> resolveReplicationConflict('keep-local'): conflict cleared, row
      // back to 'pending', local value retained.
      await pageA.getByRole('button', { name: /Keep mine/i }).click();
      await expect(toastA).toBeHidden({ timeout: 10_000 });

      await expect
        .poll(async () => (await readConflictRow(pageA, rowId))?.hasConflict, { timeout: 10_000 })
        .toBe(false);
      const rowAfterKeepMine = await readConflictRow(pageA, rowId);
      expect(rowAfterKeepMine?.syncStatus).toBe('pending');
      expect(rowAfterKeepMine?.isDirty).toBe(true);
      expect(rowAfterKeepMine?.data?.check_in_status).toBe('checked-in'); // local value kept

      // ── Context B: surface the same conflict, resolve "Take theirs" ───────────────
      await dispatchConflict(pageB, conflict);

      const toastB = pageB.getByText(TOAST_TITLE, { exact: false });
      await expect(toastB).toBeVisible({ timeout: 15_000 });
      await expect(pageB.getByRole('button', { name: /Take theirs/i })).toBeVisible();

      // "Take theirs" -> resolveReplicationConflict('take-remote'): local row replaced
      // with the remote value, marked synced, conflict cleared.
      await pageB.getByRole('button', { name: /Take theirs/i }).click();
      await expect(toastB).toBeHidden({ timeout: 10_000 });

      await expect
        .poll(async () => (await readConflictRow(pageB, rowId))?.hasConflict, { timeout: 10_000 })
        .toBe(false);
      const rowAfterTakeTheirs = await readConflictRow(pageB, rowId);
      expect(rowAfterTakeTheirs?.syncStatus).toBe('synced');
      expect(rowAfterTakeTheirs?.isDirty).toBe(false);
      expect(rowAfterTakeTheirs?.data?.check_in_status).toBe('absent'); // remote value taken
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
