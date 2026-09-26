import type { ReplicatedTable } from './core/ReplicatedTable';
import { isConflictSurfacingEnabled } from './conflictConfig';
import { reconcileDirtyRemoteRow } from './reconcileDirtyRemoteRow';
import type { SyncReplicatedTableAdapter } from './syncReplicatedTable';

/** The slice of a download adapter a single-row re-fetch needs. */
export type RowRefetchAdapter<TRemote, TLocal extends { id: string }> = Pick<
  SyncReplicatedTableAdapter<TRemote, TLocal>,
  'getRemoteId' | 'toLocalRow' | 'mergeDirtyRow' | 'rebuildUpdatePayload'
> &
  Required<Pick<SyncReplicatedTableAdapter<TRemote, TLocal>, 'fetchRowsById'>>;

/**
 * Re-fetch rows by id and reconcile each one that is still dirty (MYK9-771).
 *
 * Called when a full-row UPDATE was rejected for a stale OCC token. The row's
 * token already matches the server after that rejection, so no incremental
 * sync will download it again; this fetches it directly and runs it through
 * the same dirty-row decision as a sync (`reconcileDirtyRemoteRow`):
 * stale token only → the queued write rebases and uploads on its next retry;
 * a same-field change → the row is marked for the user, the write untouched.
 *
 * Only rows that are dirty, not already in conflict, and carry a clean base to
 * diff against are fetched: without a base there is nothing to detect a
 * conflict against, and a conflicted row already waits on the user. A fetch
 * failure rejects; the caller drops it and the next rejection asks again.
 *
 * @returns the number of rows written.
 */
export async function refetchDirtyRowsById<TRemote, TLocal extends { id: string }>(
  table: ReplicatedTable<TLocal>,
  adapter: RowRefetchAdapter<TRemote, TLocal>,
  ids: readonly string[],
  options: { conflictSurfacingEnabled?: boolean } = {}
): Promise<number> {
  // OCC tokens exist only while surfacing is on; off, there is no stale token.
  if (!(options.conflictSurfacingEnabled ?? isConflictSurfacingEnabled())) return 0;

  const wanted: string[] = [];
  for (const id of new Set(ids.map(String))) {
    const row = await table.getReplicatedRow(id);
    if (row?.isDirty && row.syncStatus !== 'conflict' && row.baseData !== undefined) {
      wanted.push(id);
    }
  }
  if (wanted.length === 0) return 0;

  const remotes = await adapter.fetchRowsById(wanted);
  let changed = 0;
  for (const remote of remotes) {
    const id = String(adapter.getRemoteId(remote));
    if (!wanted.includes(id)) continue;
    // Re-read after the fetch: the write may have uploaded, a sync may have
    // applied a newer version, or the row may have gone into conflict meanwhile.
    const existing = await table.getReplicatedRow(id);
    if (!existing?.isDirty || existing.baseData === undefined) continue;
    if (existing.syncStatus === 'conflict') continue;
    const remoteServerVersion = (remote as Record<string, unknown>).version as number | undefined;
    // A response older than the row's token would roll its data and base back
    // (or surface a false conflict); without a version it cannot be ordered.
    if (!isAtLeastRowToken(remoteServerVersion, existing.serverVersion)) continue;
    const outcome = await reconcileDirtyRemoteRow(table, adapter, {
      id,
      existing: { ...existing, baseData: existing.baseData },
      remoteLocal: { ...adapter.toLocalRow(remote), id } as TLocal,
      remoteServerVersion,
      // Re-checked inside the reconcile transaction: a sync can still land
      // between the read above and that write.
      rejectOlderThanRow: true,
    });
    if (outcome.changed) changed++;
  }
  return changed;
}

function isAtLeastRowToken(remote: number | undefined, row: number | undefined): boolean {
  return typeof remote === 'number' && (row === undefined || remote >= row);
}
