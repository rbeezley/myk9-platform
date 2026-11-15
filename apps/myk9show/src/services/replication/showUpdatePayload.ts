/**
 * MYK9-1919: a show UPDATE names only the columns it changes. `toSupabaseRow` projects the whole
 * replica row, and a queued write that kept every column would, when a conflict rebase rebuilds
 * it, send this device's copy of columns another device changed meanwhile (a switch flipped
 * elsewhere, a rename). So each queued write keeps what it changes, plus the switch columns the
 * caller set (even to the value the replica already holds), and nothing else: one column, one
 * writer.
 */
export function narrowShowUpdatePayload(
  payload: Record<string, unknown>,
  before: Record<string, unknown>,
  setColumns: ReadonlySet<string>
): Record<string, unknown> {
  const narrowed: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(payload)) {
    const keep =
      column === 'id' ||
      column === 'updated_at' ||
      setColumns.has(column) ||
      JSON.stringify(value) !== JSON.stringify(before[column]);
    if (keep) narrowed[column] = value;
  }
  return narrowed;
}
