import type { ReplicatedTable } from './core/ReplicatedTable';
import type { RefusedRowReplacement } from './core/replaceRefusedRows';
import type { RowRefetchAdapter } from './refetchDirtyRowsById';

/**
 * Re-pull rows whose queued edit the server refused for good, or the user
 * discarded (MYK9-1076), and REPLACE the local copy with the server's.
 *
 * Unlike `refetchDirtyRowsById` this does not reconcile: the edit is gone, so
 * there is nothing left to rebase or conflict with. The local row only still
 * carries the refused value (it stays dirty; nothing clears it), and
 * incremental sync never fetches a row whose server version did not move. The
 * replacement is skipped, atomically (`replaceRefusedRows`), for a row edited
 * since this call read it or with another edit still queued.
 *
 * A row the server did not return (deleted, or hidden from this user) is left
 * as it is: from here the two look alike, and sync's delete reconciliation, not
 * a failed edit, decides whether a local row goes. A fetch failure (offline)
 * rejects; the registry logs and drops it, so the row is simply not healed.
 *
 * @returns the number of rows replaced.
 */
export async function refetchRefusedRowsById<TRemote, TLocal extends { id: string }>(
  table: ReplicatedTable<TLocal>,
  adapter: RowRefetchAdapter<TRemote, TLocal>,
  ids: readonly string[]
): Promise<number> {
  const revisions = new Map<string, number>();
  for (const id of new Set(ids.map(String))) {
    const row = await table.getReplicatedRow(id);
    if (row) revisions.set(id, row.version);
  }
  if (revisions.size === 0) return 0;

  const remotes = await adapter.fetchRowsById([...revisions.keys()]);
  const entries: RefusedRowReplacement<TLocal>[] = [];
  for (const remote of remotes) {
    const id = String(adapter.getRemoteId(remote));
    const expectedRowVersion = revisions.get(id);
    if (expectedRowVersion === undefined) continue;
    const version = (remote as Record<string, unknown>).version;
    entries.push({
      id,
      expectedRowVersion,
      remote: { ...adapter.toLocalRow(remote), id } as TLocal,
      remoteServerVersion: typeof version === 'number' ? version : undefined,
    });
  }
  return (await table.replaceRefusedRows(entries)).length;
}
