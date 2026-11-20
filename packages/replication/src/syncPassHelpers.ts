import { countServerBackedRows } from './replicaCoverage';
import { overReplicaWatched } from './syncStaleCleanup';
import { scopeStampDirective } from './rowOwnership';
import { reconcileDirtyRemoteRow } from './reconcileDirtyRemoteRow';
import { isConflictSurfacingEnabled } from './conflictConfig';
import type { ReplicatedTable } from './core/ReplicatedTable';
import type { ReplicatedRow } from './types';
import type {
  SyncReplicatedTableAdapter,
  SyncReplicatedTableOptions,
  SyncScope,
} from './syncReplicatedTable.types';

/**
 * MYK9-880: a zero-row fetch is proof of an empty scope only when the device
 * holds nothing for it, or the adapter independently verifies it.
 */
export async function isScopeEmptyProven<TRemote, TLocal extends { id: string }>(
  fetchedRows: number,
  getAllRowsForScope: () => Promise<readonly object[]>,
  adapter: SyncReplicatedTableAdapter<TRemote, TLocal>,
  scope: SyncScope
): Promise<boolean> {
  if (fetchedRows > 0 || countServerBackedRows(await getAllRowsForScope()) === 0) return true;
  try {
    return (await adapter.verifyScopeEmpty?.({ scope })) === true;
  } catch {
    return false;
  }
}

/**
 * Server-authoritative, monotonic watermark: advance only to a timestamp the
 * client observed from the server. The legacy client clock is used ONLY when the
 * adapter has no timestamp hook; with a hook but nothing observed, it stays put.
 */
export function watermarkFor<TRemote, TLocal extends { id: string }>(
  adapter: SyncReplicatedTableAdapter<TRemote, TLocal>,
  sawRemoteTimestamp: boolean,
  maxRemoteUpdatedAt: number
): { advance: boolean; update: Partial<{ lastIncrementalSyncAt: number }> } {
  const advance = Boolean(adapter.getRemoteUpdatedAt) && sawRemoteTimestamp;
  const update = advance
    ? { lastIncrementalSyncAt: maxRemoteUpdatedAt }
    : adapter.getRemoteUpdatedAt
      ? {}
      : { lastIncrementalSyncAt: Date.now() };
  return { advance, update };
}

/** An incremental pass whose merge left the device holding more than the server counts (MYK9-775). */
export async function overReplicaAfterIncremental<TRemote, TLocal extends { id: string }>(
  adapter: SyncReplicatedTableAdapter<TRemote, TLocal>,
  forceFullSync: boolean,
  expectedRemoteRows: number | undefined,
  getLocalRows: () => Promise<readonly object[]>
): Promise<boolean> {
  return (
    overReplicaWatched(adapter) &&
    !forceFullSync &&
    expectedRemoteRows !== undefined &&
    countServerBackedRows(await getLocalRows()) > expectedRemoteRows
  );
}

/** A stale sync (the account changed) completes nothing, but still settles the stamp. */
export async function settleStaleAccountStamp<TLocal extends { id: string }>(
  table: ReplicatedTable<TLocal>,
  scope: SyncScope,
  writtenIds: readonly string[],
  syncingAuthUserId: string | null
): Promise<void> {
  await table.updateSyncMetadata(
    {},
    {
      scopeValue: scope.value,
      scopeSyncedBy: scopeStampDirective(writtenIds, syncingAuthUserId, false),
    }
  );
}

/**
 * A server row for a locally dirty row. With conflict surfacing on and a clean
 * base to diff against, a same-field collision is marked for the user and
 * untouched server fields merge in (the OCC token advances). Otherwise: let an
 * adapter merge server-authoritative fields (last-write-wins), or keep the dirty
 * row untouched until its pending mutation uploads.
 */
export async function mergeIntoDirtyRow<TRemote, TLocal extends { id: string }>(
  table: ReplicatedTable<TLocal>,
  adapter: SyncReplicatedTableAdapter<TRemote, TLocal>,
  options: SyncReplicatedTableOptions,
  row: {
    id: string;
    existing: ReplicatedRow<TLocal>;
    remoteLocal: TLocal;
    remoteServerVersion: number | undefined;
  }
): Promise<{ rowsAffected: number; conflictsResolved: number }> {
  const { id, existing, remoteLocal, remoteServerVersion } = row;
  const surfaceConflicts = options.conflictSurfacingEnabled ?? isConflictSurfacingEnabled();
  if (surfaceConflicts && existing.baseData !== undefined) {
    const outcome = await reconcileDirtyRemoteRow(table, adapter, {
      id,
      existing: { ...existing, baseData: existing.baseData },
      remoteLocal,
      remoteServerVersion,
    });
    return {
      rowsAffected: outcome.conflict || outcome.changed ? 1 : 0,
      conflictsResolved: outcome.changed ? 1 : 0,
    };
  }
  if (!adapter.mergeDirtyRow) return { rowsAffected: 0, conflictsResolved: 0 };
  const merged = adapter.mergeDirtyRow(existing.data, remoteLocal);
  await table.set(id, { ...merged, id } as TLocal, true);
  return { rowsAffected: 1, conflictsResolved: 1 };
}
