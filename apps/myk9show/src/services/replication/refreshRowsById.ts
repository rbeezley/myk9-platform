/**
 * Bring named rows up to the server's current copy, the way the next pull would, without
 * waiting for it (MYK9-1327: a class whose judge write was just acknowledged must not show
 * its previous server judge until the next sync).
 *
 * A row with unsent local work of its own goes through the same dirty-row reconcile a pull
 * uses; a clean row takes the server's copy through `set`, whose dirty-row guard keeps a local
 * edit made while the fetch was in flight.
 */
import {
  refetchDirtyRowsById,
  type ReplicatedTable,
  type RowRefetchAdapter,
} from '@myk9/replication';

export async function refreshRowsById<TRemote, TLocal extends { id: string }>(
  table: ReplicatedTable<TLocal>,
  adapter: RowRefetchAdapter<TRemote, TLocal>,
  ids: readonly string[],
  /** How a clean local row and the server's copy become the stored row (the table's conflict rule). */
  merge: (local: TLocal, remote: TLocal) => TLocal
): Promise<void> {
  const clean: string[] = [];
  const dirty: string[] = [];
  for (const id of new Set(ids.map(String))) {
    const row = await table.getReplicatedRow(id);
    if (row) (row.isDirty ? dirty : clean).push(id);
  }
  if (dirty.length > 0) await refetchDirtyRowsById(table, adapter, dirty);
  if (clean.length === 0) return;

  for (const remote of await adapter.fetchRowsById(clean)) {
    const id = String(adapter.getRemoteId(remote));
    if (!clean.includes(id)) continue;
    const existing = await table.getReplicatedRow(id);
    if (!existing || existing.isDirty) continue;
    const version = (remote as Record<string, unknown>).version;
    const serverVersion = typeof version === 'number' ? version : undefined;
    // Never move a row back to an older server copy than the one it holds.
    if (
      serverVersion !== undefined &&
      existing.serverVersion !== undefined &&
      serverVersion < existing.serverVersion
    ) {
      continue;
    }
    const incoming = { ...adapter.toLocalRow(remote), id } as TLocal;
    await table.set(id, merge(existing.data, incoming), false, undefined, serverVersion);
  }
}
