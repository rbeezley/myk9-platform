/**
 * Identity marker for the device-wide clubs replica (MYK9-2168).
 *
 * The clubs replica is shared by every account that signs in on a browser, and
 * `clubs_select` shows each account a different set of rows. The incremental
 * watermark says nothing about WHOSE view produced the rows, so after a reload
 * a narrower account's watermark was reused by the next account and a club it
 * can now see, but which has not changed since, never arrived.
 *
 * The marker is the table-level `syncedByAuthUserId` in the replica's own sync
 * metadata (next to the watermark): the account whose sync produced the rows
 * now stored, or ANONYMOUS_PRINCIPAL_MARKER for a signed-out or anonymous
 * session. It is the ONLY thing persisted about the principal; no row is ever
 * written on behalf of a different principal. When it is missing or differs
 * from the current principal the clean rows and the watermark are dropped
 * BEFORE any read, so a restricted row is never left for the next account.
 */
import { SyncCacheWriter, type ReplicatedTable } from '@myk9/replication';
import { logger } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';

/** Marker for a signed-out or anonymous (ringside passcode) session. */
export const ANONYMOUS_PRINCIPAL_MARKER = 'anonymous';

/** The marker a Supabase session maps to (anonymous sessions are not principals). */
export function principalMarkerFor(
  user: { id: string; is_anonymous?: boolean } | null | undefined
): string {
  return user && user.is_anonymous !== true ? user.id : ANONYMOUS_PRINCIPAL_MARKER;
}

export async function readReplicaPrincipalMarker(
  table: ReplicatedTable<{ id: string }>
): Promise<string | undefined> {
  return (await table.getSyncMetadataOrThrow())?.syncedByAuthUserId;
}

/** Record whose sync produced the rows now stored. */
export async function stampReplicaPrincipal(
  table: ReplicatedTable<{ id: string }>,
  marker: string
): Promise<void> {
  await table.updateSyncMetadata({}, { scopeSyncedBy: marker });
}

/**
 * If the stored marker is missing or is not `marker`, drop every clean row and
 * the watermark, and clear the marker (so a failed re-sync cannot leave rows
 * that read as this principal's). Dirty rows are a pending local edit and
 * survive, exactly as in every sync-path delete. Matching marker: nothing
 * changes, so the same account keeps its rows offline.
 * @returns true when the replica was purged.
 */
export async function purgeReplicaForOtherPrincipal(
  table: ReplicatedTable<{ id: string }>,
  marker: string,
  signal?: AbortSignal
): Promise<boolean> {
  if ((await readReplicaPrincipalMarker(table)) === marker) return false;
  // Rows first, marker last: a crash in between leaves the old marker, which
  // still mismatches, so the next boot purges again.
  await new SyncCacheWriter(table, signal).removeStale(new Set());
  if (signal?.aborted) return false;
  await table.updateSyncMetadata(
    {
      lastFullSyncAt: 0,
      lastIncrementalSyncAt: 0,
      totalRows: 0,
      syncStatus: 'idle',
      errorMessage: undefined,
      scopes: {},
    },
    { scopeSyncedBy: null }
  );
  return true;
}

/**
 * Make the stored rows belong to the CURRENT principal before any read is
 * served from them (see {@link purgeReplicaForOtherPrincipal}).
 * @returns the current principal's marker, or null when the session cannot be
 * read: nothing is purged then, and the caller must not trust the rows.
 */
export async function reconcileReplicaPrincipal(
  table: ReplicatedTable<{ id: string }>,
  signal?: AbortSignal
): Promise<string | null> {
  let marker: string;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    marker = principalMarkerFor(session?.user);
  } catch (err) {
    logger.warn(`[${table.getTableName()}] principal unreadable, replica not reconciled`, err);
    return null;
  }
  await purgeReplicaForMarker(table, marker, signal);
  return marker;
}

/** {@link purgeReplicaForOtherPrincipal} plus a log line, for a caller that knows the marker. */
export async function purgeReplicaForMarker(
  table: ReplicatedTable<{ id: string }>,
  marker: string,
  signal?: AbortSignal
): Promise<void> {
  if (await purgeReplicaForOtherPrincipal(table, marker, signal)) {
    logger.log(`[${table.getTableName()}] Replica purged for a new principal`);
  }
}

/**
 * After a successful sync: persist whose view produced the rows (the principal
 * the sync STARTED as). If the session changed mid-pull the marker then simply
 * mismatches the new principal, whose next reconcile purges the rows. Never
 * throws: a failed stamp only costs one extra full sync.
 */
export async function stampReplicaPrincipalSafely(
  table: ReplicatedTable<{ id: string }>,
  syncedMarker: string
): Promise<void> {
  try {
    await stampReplicaPrincipal(table, syncedMarker);
  } catch (err) {
    logger.warn(`[${table.getTableName()}] principal marker not stored`, err);
  }
}
