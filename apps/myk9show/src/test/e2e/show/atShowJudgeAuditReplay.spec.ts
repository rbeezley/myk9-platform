import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { signInAsJudge } from '../uat/shared/auth';
import {
  installSharedStagingWriteGuard,
  summarizeSharedStagingWriteLedger,
  type GuardedRingsideRpcCall,
  type SharedStagingWriteLedgerEntry,
} from '../helpers/sharedStagingWriteGuard';

/**
 * Suite category: feature-audit.
 *
 * The judge scoring replay the SCHEDULED audit runs (MYK9-144). Sibling spec
 * show/atShowJudgeScoring.spec.ts owns the authorization-routing cases; this one
 * owns the three behaviours that replay left unproven at the browser layer:
 *
 *  1. **Conflict feedback.** A `ringside_update_entry` call rejected with the
 *     RPC's real 40001 must be re-queued and re-uploaded with a re-minted OCC
 *     token — not dead-lettered, and not surfaced to the judge as a failure. A
 *     transient lost race is the system working; alarming a judge mid-ring over
 *     it is not.
 *  2. **Advance.** The post-save quick-advance chip actually navigates to the
 *     next dog's scoresheet. The sibling spec asserts the chip is *visible*;
 *     visible-but-inert would pass that and strand a judge at the gate.
 *  3. **Escape proof.** Every shared-staging write is accounted for, and the
 *     ledger is attached to the run as the artifact behind the audit's "shared
 *     staging received no writes" claim.
 *
 * Fixture: Heartland Scent Work Classic demo seed. Entry ...052 (Willow,
 * Interior Advanced) is the scored dog; ...053 (Ranger) is the same class's
 * run-order-2 entry, so the quick-advance chip has a real destination. Both are
 * intercepted — nothing here mutates the shared Supabase project.
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
const PENDING_MUTATIONS_STORE = 'pending_mutations';

test.describe('At-show judge scheduled audit replay', () => {
  test('re-uploads a version-conflicted score with a re-minted token instead of dead-lettering it', async ({
    page,
  }, testInfo) => {
    const rpcCalls: GuardedRingsideRpcCall[] = [];
    const ledger: SharedStagingWriteLedgerEntry[] = [];
    // The first score attempt loses a race; the retry must win. Matched on the
    // payload, not the call ordinal — scoring one dog also emits check-in and
    // check-out ringside writes, and rejecting one of those would prove nothing
    // about scoring.
    await installSharedStagingWriteGuard(page, {
      ringsideRpcCalls: rpcCalls,
      ledger,
      conflictResponses: 1,
      conflictMatcher: call => call.p_fields?.is_scored === true,
      conflictServerVersion: 4242,
    });

    await signInAsJudge(page, SCORE_PATH);
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('result-Q').click();
    await page.getByRole('button', { name: /^Save$/ }).click();
    await page.getByRole('button', { name: /Confirm & Submit/i }).click();
    await expect(page).toHaveURL(new RegExp(escapeRegExp(CLASS_PATH)), { timeout: 15_000 });

    // The rejected write is retried rather than dropped: the same entry reaches
    // the RPC at least twice (the 40001, then the accepted write).
    await expect
      .poll(() => scoredCallsFor(rpcCalls).length, { timeout: 30_000 })
      .toBeGreaterThanOrEqual(2);

    // ...and the queue actually empties, so the retry succeeded rather than
    // parking the mutation in permanent backoff.
    await expect.poll(() => readPendingMutationCount(page), { timeout: 30_000 }).toBe(0);

    // The retry re-mints its OCC token rather than replaying the rejected one —
    // the ringside conflict-storm guard. (It carries the replicated row's
    // *current* token, which intervening check-in/check-out writes may have
    // advanced past the version this conflict advertised, so assert movement,
    // not a specific number.)
    await expect
      .poll(() => new Set(scoredCallsFor(rpcCalls).map(call => call.p_expected_version)).size, {
        timeout: 20_000,
      })
      .toBeGreaterThan(1);

    // The judge is never told anything went wrong — a transient conflict is not
    // a user-facing failure.
    await expect(page.getByText(/failed to sync/i)).toHaveCount(0);
    await expect(page.getByText(/couldn't save/i)).toHaveCount(0);

    // The score is the one the judge entered, not the losing attempt's ghost.
    await expect
      .poll(() => readEntryReplica(page), { timeout: 15_000 })
      .toMatchObject({
        data: expect.objectContaining({ result_status: 'qualified', is_scored: true }),
      });

    await attachWriteLedger(testInfo, ledger, { fixtureEntryId: ENTRY_ID });
  });

  test('advances from the saved dog to the next dog via the quick-advance chip', async ({
    page,
  }, testInfo) => {
    const ledger: SharedStagingWriteLedgerEntry[] = [];
    await installSharedStagingWriteGuard(page, { ledger });

    await signInAsJudge(page, SCORE_PATH);
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('result-Q').click();
    await page.getByRole('button', { name: /^Save$/ }).click();
    await page.getByRole('button', { name: /Confirm & Submit/i }).click();
    await expect(page).toHaveURL(new RegExp(escapeRegExp(CLASS_PATH)), { timeout: 15_000 });

    const chip = page.getByTestId('quick-advance-entry').first();
    await expect(chip).toBeVisible();
    await chip.click();

    // The chip opens a *different* entry's scoresheet in the same class — the
    // judge is moved on, not returned to the dog they just scored.
    const scorePathPattern = new RegExp(
      `${escapeRegExp(`/at-show/${SHOW_ID}/class/${CLASS_ID}/score/`)}([0-9a-f-]{36})`
    );
    await expect(page).toHaveURL(scorePathPattern, { timeout: 15_000 });
    const advancedEntryId = scorePathPattern.exec(page.url())?.[1];
    expect(advancedEntryId).toBeTruthy();
    expect(advancedEntryId).not.toBe(ENTRY_ID);

    // It is a working scoresheet, not just a route change.
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 20_000 });

    await attachWriteLedger(testInfo, ledger, { fixtureEntryId: ENTRY_ID, advancedEntryId });
  });
});

/**
 * The audit's evidence artifact: what the replay wrote, and where it went.
 *
 * `blocked` must be empty. A non-empty `blocked` list means a code path tried a
 * shared-staging write no guard rule anticipated — the abort kept staging clean,
 * but the guard needs a rule for it before the next replay.
 */
async function attachWriteLedger(
  testInfo: TestInfo,
  ledger: SharedStagingWriteLedgerEntry[],
  fixture: Record<string, string | undefined>
) {
  const summary = summarizeSharedStagingWriteLedger(ledger);

  expect(
    summary.blocked,
    'an unrecognised shared-staging write was attempted during the audit replay'
  ).toEqual([]);
  expect(
    summary.intercepted,
    'the replay reached the shared-staging write path at least once'
  ).toBeGreaterThan(0);

  await testInfo.attach('shared-staging-write-ledger.json', {
    contentType: 'application/json',
    body: Buffer.from(
      JSON.stringify(
        {
          test: testInfo.title,
          project: testInfo.project.name,
          fixture,
          sharedStagingWritesForwarded: 0,
          summary: { total: summary.total, intercepted: summary.intercepted, blocked: 0 },
          entries: ledger,
        },
        null,
        2
      )
    ),
  });
}

function scoredCallsFor(rpcCalls: GuardedRingsideRpcCall[]) {
  return rpcCalls.filter(call => call.p_entry_id === ENTRY_ID && call.p_fields?.is_scored === true);
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
