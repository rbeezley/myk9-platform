/**
 * Ringside RPC routing for entries writes.
 *
 * The `entries` UPDATE RLS policy admits only show managers (can_manage_show).
 * At-show ringside writes are performed by assigned judges and show-scoped
 * stewards, whose JWT role is NOT admitted by that policy — so a direct UPDATE
 * silently matches 0 rows on sync. The `ringside_update_entry` SECURITY DEFINER
 * RPC (migration 20260621120000) does its own per-row authorization and writes
 * a whitelisted set of ringside columns.
 *
 * Rather than tag every at-show call site (and risk missing one), we route
 * AUTOMATICALLY by delta: if every column a write touches is in the ringside
 * whitelist, send it through the RPC; otherwise keep the direct UPDATE. This is
 * complete (no at-show write site can be missed), behavior-preserving for
 * managers (the RPC yields the same result for an authorized manager), and
 * leaves secretary entry-management writes — which touch non-ringside columns
 * like entry_status / armband / refunds — on the direct path.
 *
 * The whitelist MUST mirror the column allow-list in the RPC migration. Keep the
 * two in sync; `ringsideEntryRpc.test.ts` pins the set.
 */

export const RINGSIDE_RPC_FUNCTION = 'ringside_update_entry';

/**
 * snake_case `entries` columns the ringside RPC accepts. Mirrors
 * v_runorder_checkin_cols + v_scoring_cols in migration
 * 20260621120000_ringside_update_entry.sql.
 */
export const RINGSIDE_RPC_COLUMNS: ReadonlySet<string> = new Set([
  // run-order + check-in
  'run_order',
  'check_in_status',
  'is_in_ring',
  'ring_entry_time',
  'ring_exit_time',
  // scoring + placement
  'is_scored',
  'result_status',
  'search_time_seconds',
  'area1_time_seconds',
  'area2_time_seconds',
  'area3_time_seconds',
  'area4_time_seconds',
  'total_correct_finds',
  'total_incorrect_finds',
  'total_faults',
  'no_finish_count',
  'area1_correct',
  'area1_incorrect',
  'area1_faults',
  'area2_correct',
  'area2_incorrect',
  'area2_faults',
  'area3_correct',
  'area3_incorrect',
  'area3_faults',
  'total_score',
  'points_earned',
  'points_possible',
  'bonus_points',
  'penalty_points',
  'time_over_limit',
  'time_limit_exceeded_seconds',
  'final_placement',
  'judge_notes',
  'judge_signature',
  'judge_signature_timestamp',
  'disqualification_reason',
  'has_video_review',
  'video_review_notes',
  'scoring_started_at',
  'scoring_completed_at',
]);

/**
 * Columns that are auto-managed (triggers / system / OCC) and so do NOT count as
 * "intent" when deciding whether a write is ringside-only. A check-in write that
 * also carries `updated_at` must still be recognized as ringside-routable.
 */
const IGNORED_COLUMNS: ReadonlySet<string> = new Set([
  'id',
  'version',
  'created_at',
  'updated_at',
  'last_synced_at',
  'sync_version',
  'local_id',
  'license_key',
]);

/** Convert a camelCase key to its snake_case column name. Snake input passes through. */
export function toSnakeCase(key: string): string {
  return key.replace(/([A-Z])/g, '_$1').toLowerCase();
}

/**
 * Decide whether an entries UPDATE should be routed through the ringside RPC, and
 * if so build the snake_case delta payload from the canonical Supabase row.
 *
 * @param updateKeys - the keys the caller passed to updateEntry (camel or snake).
 * @param supabaseRow - the full snake_case row from toSupabaseRow (value source).
 * @returns the RPC fields delta if the write touches ONLY ringside columns, else null.
 */
export function buildRingsideRpcFields(
  updateKeys: string[],
  supabaseRow: Record<string, unknown>
): Record<string, unknown> | null {
  const touched = new Set<string>();
  for (const key of updateKeys) {
    const col = toSnakeCase(key);
    if (!IGNORED_COLUMNS.has(col)) touched.add(col);
  }

  if (touched.size === 0) return null;
  for (const col of touched) {
    if (!RINGSIDE_RPC_COLUMNS.has(col)) return null; // a non-ringside column → direct UPDATE
  }

  const fields: Record<string, unknown> = {};
  for (const col of touched) {
    if (col in supabaseRow) fields[col] = supabaseRow[col];
  }
  return Object.keys(fields).length > 0 ? fields : null;
}
