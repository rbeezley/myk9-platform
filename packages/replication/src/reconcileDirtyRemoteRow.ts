import type { ReplicatedTable } from './core/ReplicatedTable';
import { detectDirtyRowConflict, instantFieldsFor } from './conflict/detectDirtyRowConflict';
import type { SyncReplicatedTableAdapter } from './syncReplicatedTable';
import type { ReplicatedRow, ReplicationConflictSnapshot } from './types';

export interface DirtyRemoteRowOutcome {
  /** A same-field collision was found; the row is held for the user. */
  conflict: boolean;
  /** The row was written (conflict newly marked, or reconciled). */
  changed: boolean;
}

/**
 * Apply a fresh server snapshot to a locally-dirty row that has a clean base to
 * diff against (conflict surfacing on). Shared by the sync download loop and the
 * single-row re-fetch after a stale OCC rejection (MYK9-771), so both decide the
 * same way:
 *
 * - A same-field collision marks the row `conflict` and dispatches
 *   `replication:conflict`. The queued write is left untouched for the resolver.
 * - Anything else reconciles: server fields the client never touched merge in,
 *   and the queued write rebases onto the server's token
 *   (`ReplicatedTable.reconcileDirtyRow`).
 */
export async function reconcileDirtyRemoteRow<TRemote, TLocal extends { id: string }>(
  table: ReplicatedTable<TLocal>,
  adapter: Pick<
    SyncReplicatedTableAdapter<TRemote, TLocal>,
    'mergeDirtyRow' | 'rebuildUpdatePayload'
  >,
  params: {
    id: string;
    existing: ReplicatedRow<TLocal> & { baseData: TLocal };
    remoteLocal: TLocal;
    remoteServerVersion: number | undefined;
  }
): Promise<DirtyRemoteRowOutcome> {
  const { id, existing, remoteLocal, remoteServerVersion } = params;
  const detection = detectDirtyRowConflict({
    base: existing.baseData,
    local: existing.data,
    remote: remoteLocal,
    instantFields: instantFieldsFor(table.getTableName()),
  });
  if (detection.hasConflict) {
    const snapshot: ReplicationConflictSnapshot<TLocal> = {
      tableName: table.getTableName(),
      rowId: id,
      fields: detection.fields,
      localData: existing.data,
      remoteData: remoteLocal,
      baseData: existing.baseData,
      baseVersion: existing.baseVersion ?? 0,
      localVersion: existing.version,
      remoteServerVersion: remoteServerVersion ?? 0,
      detectedAt: Date.now(),
    };
    // A snapshot older than the row's token marks nothing (MYK9-794).
    const marked = await table.markConflict(id, snapshot, remoteServerVersion);
    if (marked && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('replication:conflict', { detail: snapshot }));
    }
    return { conflict: true, changed: marked };
  }

  // No same-field conflict → reconcile server-authoritative fields the client
  // never touched into the dirty row, and advance the OCC token so the next
  // upload's precondition matches the server. Root-cause fix for the stale-token
  // storm (docs/plan-replication-stale-occ-token-sync.md). When an adapter
  // defines mergeDirtyRow it owns the data merge; otherwise a generic 3-way
  // merge adopts only the fields the client never changed.
  const reconciled = await table.reconcileDirtyRow(id, {
    base: existing.baseData,
    remote: remoteLocal,
    remoteServerVersion,
    mergedData: adapter.mergeDirtyRow
      ? ({ ...adapter.mergeDirtyRow(existing.data, remoteLocal), id } as TLocal)
      : undefined,
    rebuildPayload: adapter.rebuildUpdatePayload,
  });
  return { conflict: false, changed: reconciled };
}
