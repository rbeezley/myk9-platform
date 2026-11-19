import type { ReplicatedTable } from './core/ReplicatedTable';
import {
  deepEqual,
  detectDirtyRowConflict,
  instantFieldsFor,
} from './conflict/detectDirtyRowConflict';
import { resolveInFlightMergeBase } from './inflight-written-base';
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
 * - A collision the table's compare policy reads as the same outcome (MYK9-1104)
 *   is no collision: the server's spelling or stamp is adopted, the write rebases.
 * - A write of this device that is in flight counts as part of the base when
 *   the snapshot is that write landing (MYK9-1221, `resolveInFlightMergeBase`).
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
  // MYK9-1221: a write of this device that is sent but not yet acknowledged is
  // part of the base when the snapshot is that write landing.
  const base = resolveInFlightMergeBase({
    base: existing.baseData,
    baseServerVersion: existing.baseServerVersion,
    remote: remoteLocal,
    remoteServerVersion,
    inFlight: table.getInFlightWrites(id),
    instantFields: instantFieldsFor(table.getTableName()),
    comparePolicy: adapter.dirtyRowComparePolicy,
  });
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
      baseData: base,
      baseVersion: existing.baseVersion ?? 0,
      localVersion: existing.version,
      remoteServerVersion: remoteServerVersion ?? 0,
      detectedAt: Date.now(),
      ...(detection.serverWonFields && { serverWonFields: detection.serverWonFields }),
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
    dropQueuedFields: detection.serverWonFields,
    detectedAtVersion: existing.version,
    mergedData: adapter.mergeDirtyRow
      ? ({ ...adapter.mergeDirtyRow(existing.data, remoteLocal), id } as TLocal)
      : undefined,
    rebuildPayload: adapter.rebuildUpdatePayload,
  });
  // MYK9-2111: a queued RPC delta whose every field the server already holds landed; only its
  // acknowledgement was lost. Dequeue it instead of resending (a different field is never
  // dropped here: it stays queued, or was surfaced as a conflict above).
  const instantFields = instantFieldsFor(table.getTableName());
  const normalize = adapter.dirtyRowComparePolicy?.normalizeValue;
  const acked = await table.acknowledgeAppliedRpcWrites(id, (field, value) => {
    const remoteValue = (remoteLocal as Record<string, unknown>)[field];
    return deepEqual(
      normalize ? normalize(field, value) : value,
      normalize ? normalize(field, remoteValue) : remoteValue,
      instantFields.has(field)
    );
  });
  return { conflict: false, changed: reconciled || acked > 0 };
}
