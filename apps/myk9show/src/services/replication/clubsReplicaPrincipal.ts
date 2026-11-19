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
import { SyncCacheWriter, type ReplicatedTable, type SyncResult } from '@myk9/replication';
import { logger } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';

/** Marker for a signed-out or anonymous (ringside passcode) session. */
export const ANONYMOUS_PRINCIPAL_MARKER = 'anonymous';

/**
 * The current principal's marker. THROWS when the lookup errors (an expired
 * session that cannot refresh offline resolves `{ session: null, error }`),
 * so that is never mistaken for a signed-out visitor.
 */
export async function currentPrincipalMarker(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw error;
  return principalMarkerFor(session?.user);
}

/** The marker a Supabase session maps to (anonymous sessions are not principals). */
export function principalMarkerFor(
  user: { id: string; is_anonymous?: boolean } | null | undefined
): string {
  return user && user.is_anonymous !== true ? user.id : ANONYMOUS_PRINCIPAL_MARKER;
}

export async function readReplicaPrincipalMarker<T extends { id: string }>(
  table: ReplicatedTable<T>
): Promise<string | undefined> {
  return (await table.getSyncMetadataOrThrow())?.syncedByAuthUserId;
}

/** Record whose sync produced the rows now stored. */
export async function stampReplicaPrincipal<T extends { id: string }>(
  table: ReplicatedTable<T>,
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
export async function purgeReplicaForOtherPrincipal<T extends { id: string }>(
  table: ReplicatedTable<T>,
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
export async function reconcileReplicaPrincipal<T extends { id: string }>(
  table: ReplicatedTable<T>,
  signal?: AbortSignal
): Promise<string | null> {
  let marker: string;
  try {
    marker = await currentPrincipalMarker();
  } catch (err) {
    logger.warn(`[${table.getTableName()}] principal unreadable, replica not reconciled`, err);
    return null;
  }
  await purgeReplicaForMarker(table, marker, signal);
  return marker;
}

/** {@link purgeReplicaForOtherPrincipal} plus a log line, for a caller that knows the marker. */
export async function purgeReplicaForMarker<T extends { id: string }>(
  table: ReplicatedTable<T>,
  marker: string,
  signal?: AbortSignal
): Promise<void> {
  if (await purgeReplicaForOtherPrincipal(table, marker, signal)) {
    logger.log(`[${table.getTableName()}] Replica purged for a new principal`);
  }
}

/**
 * After a successful pull: persist whose view produced the rows. Fenced: only
 * when the session is STILL the principal the pull started as, else this throws
 * and the sync fails (the rows stay unmarked, so the next reconcile purges them).
 * A failed write throws too, so readiness stays retryable.
 */
export async function stampReplicaPrincipalFenced<T extends { id: string }>(
  table: ReplicatedTable<T>,
  syncedMarker: string
): Promise<void> {
  if ((await currentPrincipalMarker()) !== syncedMarker) {
    throw new Error('The signed-in account changed while clubs were loading; nothing was saved.');
  }
  await stampReplicaPrincipal(table, syncedMarker);
}

/** A sync that stopped before pulling, or whose marker could not be settled. */
export function failedPrincipalSyncResult(tableName: string, error: string): SyncResult {
  return {
    tableName,
    success: false,
    operation: 'full-sync',
    rowsAffected: 0,
    duration: 0,
    error,
  };
}
