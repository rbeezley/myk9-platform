/**
 * How many of the server's rows this device accounts for, compared against a
 * server row count by the sync engine's partial-replica check and by the app's
 * offline-readiness gates.
 *
 * - A pending local create (`_localOnly`) is not on the server yet, so it never
 *   stands in for a missing row (MYK9-752).
 * - A row this device deleted and has a DELETE queued for is still on the
 *   server until that DELETE uploads, so it is counted: a pending delete must
 *   not read as a missing row (MYK9-762). Only ids no longer held locally are
 *   added, so a row whose delete is queued but still present is counted once.
 *
 * `pendingDeleteIds` must hold only rows the server still counts in the same
 * scope — the caller's job; see the app's `PendingDeletes`.
 */
export function countCoveredRows(
  rows: readonly object[],
  pendingDeleteIds?: ReadonlySet<string>
): number {
  const present = new Set<string>();
  let covered = 0;
  for (const row of rows) {
    const { id, _localOnly } = row as { id?: unknown; _localOnly?: unknown };
    if (id !== undefined && id !== null) present.add(String(id));
    if (_localOnly !== true) covered++;
  }
  for (const id of pendingDeleteIds ?? []) {
    if (!present.has(id)) covered++;
  }
  return covered;
}

/**
 * The ids a full-sync stale-row cleanup must keep: every id the fetch returned,
 * plus every local row OUTSIDE this sync's scope. `removeStaleEntries` walks the
 * whole table, so without the second half a per-scope full fetch (trials, one
 * show at a time) would remove every other scope's rows (MYK9-762).
 *
 * Returns null when the whole table cannot be read: a failed read looks empty,
 * and an empty "outside" set would put every other scope up for removal. A
 * failed read of `scopeRows` is safe the other way: it keeps every row.
 */
export async function staleCleanupKeepIds(
  table: {
    getAllWithStatus(): Promise<{ ok: boolean; rows: readonly { id: string }[] }>;
  },
  serverIds: ReadonlySet<string>,
  scopeRows: readonly { id: string }[]
): Promise<Set<string> | null> {
  const all = await table.getAllWithStatus();
  if (!all.ok) return null;
  const inScope = new Set(scopeRows.map(row => String(row.id)));
  const keep = new Set(serverIds);
  for (const row of all.rows) {
    if (!inScope.has(String(row.id))) keep.add(String(row.id));
  }
  return keep;
}
