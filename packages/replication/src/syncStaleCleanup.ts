import type { ReplicatedTable } from './core/ReplicatedTable';
import type { SyncCacheWriter } from './syncCacheWriter';
import { staleCleanupKeepIds } from './replicaCoverage';
import type { SyncScope, SyncReplicatedTableAdapter } from './syncReplicatedTable.types';

interface StaleCleanupInput<TRemote, TLocal extends { id: string }> {
  table: ReplicatedTable<TLocal>;
  /** Every delete goes through this, so a cancelled sync deletes nothing. */
  cache: SyncCacheWriter<TLocal>;
  adapter: SyncReplicatedTableAdapter<TRemote, TLocal>;
  scope: SyncScope;
  serverIds: Set<string>;
  accountOwned: boolean;
  /** The account captured before the fetch; the only one whose rows this may remove. */
  syncingAuthUserId: string | null;
  forceFullSync: boolean;
  expectedRemoteRows: number | undefined;
  coveredCount: number;
  fetchStartedAt: number;
  scopeEmptyIsProven: () => Promise<boolean>;
  getLocalRowsForScope: () => Promise<TLocal[]>;
}

/**
 * Remove rows the server no longer has (MYK9-1250: cleanup OWNERSHIP).
 *
 * Absence is proven by the response fetched for `syncingAuthUserId`, so only
 * THAT account's rows may be removed by it. Every cleanup read and the delete
 * transaction are pinned to the captured account (`ownerAuthUserId`), never the
 * signed-in one: a session that switched mid-pass cannot have its own cache
 * selected, and there is no check-then-delete gap to race because the delete
 * predicate itself is the owner. The early identity check only stops a pass that
 * already lost its account from touching even the old account's rows; the
 * caller's stale-account refusal still reports the failure.
 */
export async function runStaleCleanup<TRemote, TLocal extends { id: string }>(
  input: StaleCleanupInput<TRemote, TLocal>
): Promise<{ removed: number; completed: boolean }> {
  const { table, cache, adapter, serverIds, accountOwned, syncingAuthUserId } = input;
  const none = { removed: 0, completed: false };
  if (accountOwned && (await table.getCurrentAuthUserId()) !== syncingAuthUserId) return none;
  const ownerAuthUserId = accountOwned ? (syncingAuthUserId ?? undefined) : undefined;

  if (adapter.shouldCleanupStaleRows) {
    return {
      removed: await cache.removeStale(serverIds, { ownerAuthUserId }),
      completed: true,
    };
  }
  if (
    !adapter.cleanupStaleRowsOnFullSync ||
    !input.forceFullSync ||
    // Only a fetch known to be COMPLETE proves a row is gone: a capped or paged
    // response (PostgREST max_rows) returns the oldest rows only, and cleaning up
    // after it would delete the newest (MYK9-775 review P2). No server count, no
    // cleanup.
    input.expectedRemoteRows === undefined ||
    input.coveredCount < input.expectedRemoteRows ||
    !(await input.scopeEmptyIsProven())
  ) {
    return none;
  }
  const keep = await staleCleanupKeepIds(
    table,
    serverIds,
    await input.getLocalRowsForScope(),
    ownerAuthUserId
  );
  if (!keep) return none;
  const removed = await cache.removeStale(keep, {
    syncedBefore: input.fetchStartedAt,
    ownerAuthUserId,
  });
  return { removed, completed: true };
}

/** True when a count below the local server-backed rows must force a full sync. */
export function overReplicaWatched(adapter: {
  cleanupStaleRowsOnFullSync?: boolean;
  detectOverReplica?: boolean;
}): boolean {
  return adapter.cleanupStaleRowsOnFullSync === true || adapter.detectOverReplica === true;
}
