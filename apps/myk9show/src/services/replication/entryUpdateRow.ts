import { entryToSupabaseRow, type ReplicatedEntry } from './ReplicatedEntriesTable.mapper';

/**
 * MYK9-878: the row a queued UPDATE uploads. The fee is fixed at entry creation,
 * and the server may have priced the INSERT below the fee this device holds (the
 * junior handler fee, lowered by `trg_entries_junior_fee`; the INSERT ack returns
 * only the id, so the local copy is not reconciled before a later UPDATE). A
 * whole-row upload would write the device's fee back over the server's, so
 * `entry_fee` is sent only when the caller named it, and the override marker (an
 * INSERT-time request) never.
 */
export function entryToSupabaseUpdateRow(
  entry: ReplicatedEntry,
  editedFee = false
): Record<string, unknown> {
  const row = entryToSupabaseRow(entry);
  delete row.junior_fee_override_by;
  if (!editedFee) delete row.entry_fee;
  return row;
}

/** True when an `updateEntry` patch really edits the fee. */
export function editsEntryFee(
  updates: Partial<ReplicatedEntry> & { entry_fee?: unknown }
): boolean {
  return 'entryFee' in updates || 'entry_fee' in updates;
}
