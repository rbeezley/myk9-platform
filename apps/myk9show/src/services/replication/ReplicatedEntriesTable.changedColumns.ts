/**
 * MYK9-1442: project a full serialized entry row down to the columns a caller
 * actually changed.
 *
 * A queued UPDATE that carries the whole row writes back every column at the
 * device's last-seen value. When an earlier queued write (or another device)
 * made the server's trigger move a column, the later full-row write silently
 * restores the stale value (a Pull then Accept then unrelated edit lost the
 * restored check-in). Queueing only the touched columns leaves the rest to the
 * server.
 */
import { entryToSupabaseRow, type ReplicatedEntry } from './ReplicatedEntriesTable.mapper';
import { toSnakeCase } from './ringsideEntryRpc';

/** Columns every entry UPDATE carries regardless of what changed. */
const ALWAYS_SENT = ['id', 'updated_at'] as const;

/**
 * Probe values of different types. The mapper coerces some keys (a placement
 * through Number(), a flag through !!), so one probe can serialize to the very
 * value the row already holds (a string placement -> NaN -> null over a null
 * placement) and hide the column. A column counts when ANY probe moves it.
 */
const PROBES: readonly unknown[] = ['\u0000myk9-1442-probe\u0000', 987_654_321, null];

function stableJson(value: unknown): string {
  return JSON.stringify(value) ?? 'undefined';
}

/**
 * The DB columns the `updates` keys write, found through the mapper itself so the
 * aliases (`checkInStatus` / `check_in_status`, `totalPoints` -> `total_score`)
 * and derived columns (`final_placement` from `resultStatus`) are never
 * re-declared here. A column counts when planting a probe in the key moves it, or
 * when the new value differs from the row's previous serialization.
 */
export function changedEntryColumns(
  before: ReplicatedEntry,
  updates: Partial<ReplicatedEntry>,
  after: ReplicatedEntry
): Set<string> {
  const beforeRow = entryToSupabaseRow(before);
  const afterRow = entryToSupabaseRow(after);
  const columns = new Set<string>(ALWAYS_SENT);

  for (const key of Object.keys(updates)) {
    // The key's own column is always explicit, even when no probe can move it
    // (final_placement is forced null for a non-qualified result): a cleared
    // placement must still reach buildRingsideRpcFields, which maps keys the
    // same way, or the write falls back to a direct UPDATE a steward cannot make.
    const direct = toSnakeCase(key);
    if (direct !== 'updated_at' && direct in afterRow) columns.add(direct);
    for (const probe of PROBES) {
      const probeRow = entryToSupabaseRow({ ...before, [key]: probe } as ReplicatedEntry);
      for (const col of new Set([...Object.keys(beforeRow), ...Object.keys(probeRow)])) {
        if (col !== 'updated_at' && stableJson(beforeRow[col]) !== stableJson(probeRow[col])) {
          columns.add(col);
        }
      }
    }
  }
  for (const col of Object.keys(afterRow)) {
    if (stableJson(beforeRow[col]) !== stableJson(afterRow[col])) columns.add(col);
  }
  return columns;
}

/** The serialized row narrowed to the columns the caller changed. */
export function entryChangedColumnsRow(
  before: ReplicatedEntry,
  updates: Partial<ReplicatedEntry>,
  after: ReplicatedEntry
): Record<string, unknown> {
  const row = entryToSupabaseRow(after);
  const columns = changedEntryColumns(before, updates, after);
  return Object.fromEntries(Object.entries(row).filter(([col]) => columns.has(col)));
}
