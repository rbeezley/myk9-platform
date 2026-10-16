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
 * True when `remoteServerVersion` is the version this device's own last upload
 * moved the row to (`lastOwnUpload.to`). Versions only increase, so the server
 * row at that version is exactly what that upload wrote.
 */
function isOwnAcknowledgedWrite(
  existing: Pick<ReplicatedRow<unknown>, 'lastOwnUpload'>,
  remoteServerVersion: number | undefined
): boolean {
  return remoteServerVersion !== undefined && existing.lastOwnUpload?.to === remoteServerVersion;
}

/**
 * Apply a fresh server snapshot to a locally-dirty row that has a clean base to
 * diff against (conflict surfacing on). Shared by the sync download loop and the
 * single-row re-fetch after a stale OCC rejection (MYK9-771), so both decide the
 * same way:
 *
 * - A same-field collision marks the row `conflict` and dispatches
 *   `replication:conflict`. The queued write is left untouched for the resolver.
 * - A collision the table's compare policy reads as the same outcome (MYK9-1104)
 *   is no collision: the server's spelling or stamp is adopted, the write rebases.
 * - Anything else reconciles: server fields the client never touched merge in,
 *   and the queued write rebases onto the server's token
 *   (`ReplicatedTable.reconcileDirtyRow`).
 */
export async function reconcileDirtyRemoteRow<TRemote, TLocal extends { id: string }>(
  table: ReplicatedTable<TLocal>,
  adapter: Pick<
    SyncReplicatedTableAdapter<TRemote, TLocal>,
    'mergeDirtyRow' | 'rebuildUpdatePayload' | 'dirtyRowComparePolicy'
  >,
  params: {
    id: string;
    existing: ReplicatedRow<TLocal> & { baseData: TLocal };
    remoteLocal: TLocal;
    remoteServerVersion: number | undefined;
  }
): Promise<DirtyRemoteRowOutcome> {
  const { id, existing, remoteLocal, remoteServerVersion } = params;
  // MYK9-1220: when the snapshot IS this device's own acknowledged write, the
  // server holds nothing the device did not write, so the merge base is that
  // snapshot (the original base predates the write and would read it as a
  // third-party change). Any other version keeps the original base.
  const base = isOwnAcknowledgedWrite(existing, remoteServerVersion)
    ? remoteLocal
    : existing.baseData;
  const detection = detectDirtyRowConflict({
    base,
    local: existing.data,
    remote: remoteLocal,
    instantFields: instantFieldsFor(table.getTableName()),
    comparePolicy: adapter.dirtyRowComparePolicy,
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
    base,
    remote: remoteLocal,
    remoteServerVersion,
    adoptRemoteFields: detection.adoptRemoteFields,
    detectedAtVersion: existing.version,
    mergedData: adapter.mergeDirtyRow
      ? ({ ...adapter.mergeDirtyRow(existing.data, remoteLocal), id } as TLocal)
      : undefined,
    rebuildPayload: adapter.rebuildUpdatePayload,
  });
  return { conflict: false, changed: reconciled };
}
