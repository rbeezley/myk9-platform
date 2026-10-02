/**
 * The ONE purge-time guard every declared local store shares (MYK9-922).
 *
 * `deleteRecords` checks the queue for unsaved work before it calls the server,
 * but the server call takes time and another tab can queue an entry create or
 * edit inside it. So the purge asks again, per row, at the moment it would drop
 * the row: a row that is dirty, local-only, or has a pending or failed mutation
 * is kept. Normal sync resolves it; the server already tombstoned the parent and
 * its trigger refuses an upload under a deleted parent, which the replication
 * layer drops with a clear message. A lock would not help: the other tab holds
 * no lock this tab can see.
 */

/** What a replica table offers the guard (`ReplicatedTable.hasUnsyncedLocalWork`). */
export interface LocalWorkReader {
  hasUnsyncedLocalWork(id: string): Promise<boolean>;
}

/** Split `ids` into those safe to purge and those holding local work (kept). */
export async function splitByLocalWork(
  table: LocalWorkReader,
  ids: Iterable<string>
): Promise<{ purge: string[]; kept: Set<string> }> {
  const purge: string[] = [];
  const kept = new Set<string>();
  for (const id of ids) {
    if (await table.hasUnsyncedLocalWork(id)) kept.add(id);
    else purge.push(id);
  }
  return { purge, kept };
}
