/**
 * Client-side guard for withheld scored result columns on the replication path.
 *
 * Migration 20260616120000 gates PUBLIC/anon scored results server-side through
 * `view_public_entry_results`, and the AUTHENTICATED own-entry view
 * `view_authenticated_entry_results` applies the same per-field visibility
 * cascade (placement / qualification / time / faults, resolved show -> trial ->
 * class). The offline replication store is populated from the cascade-aware
 * results view, but this helper remains a defensive boundary for any rows
 * that may contain scored columns before release rules have been applied.
 *
 * The per-class visibility config is resolved by the server view before rows
 * reach the replica. The safe-by-default behavior is therefore:
 *
 *   - On the replication-mapped path, NULL every withheld-until-released scored
 *     column. The exhibitor still gets full offline entry identity / status /
 *     where-when; only the result fields are withheld.
 *   - When any own entry is scored, the cascade-aware server view remains the
 *     online authority; nulled replication rows are the safe fallback if it is
 *     unreachable.
 *
 * This keeps both read paths consistent: the server view nulls withheld fields
 * in SQL; this helper nulls them on the replicated row.
 */

/**
 * Scored result columns governed by the per-field visibility cascade. These are
 * the only columns withheld until release — entry identity, status, schedule,
 * check-in, and payment fields are unaffected.
 */
export const WITHHELD_SCORED_COLUMNS = [
  'final_placement',
  'result_status',
  'search_time_seconds',
  'total_faults',
  'total_score',
  'result_text',
] as const;

/**
 * Null every withheld scored column on a replication-mapped entry row.
 *
 * Mutates and returns the same row object (the row builder owns it). `is_scored`
 * is intentionally preserved so callers can still detect that a result EXISTS
 * (and route to the cascade-aware server view) without exposing its value.
 */
export function withholdScoredResultColumns(row: Record<string, unknown>): Record<string, unknown> {
  for (const column of WITHHELD_SCORED_COLUMNS) {
    if (column in row) {
      row[column] = null;
    }
  }
  return row;
}

/**
 * Does this replicated entry carry a scored result? Drives whether
 * `getUserEntries` should prefer the cascade-aware server view so released
 * results still surface online.
 */
export function hasScoredResult(entry: {
  isScored?: boolean | null | undefined;
  is_scored?: boolean | null | undefined;
}): boolean {
  return entry.isScored === true || entry.is_scored === true;
}
