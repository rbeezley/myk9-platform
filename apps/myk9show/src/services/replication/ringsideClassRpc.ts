/**
 * Ringside class writes go through `ringside_update_class` (SECURITY DEFINER).
 *
 * `classes_update` RLS admits only managers, so a judge's ringside class write --
 * a status change (MYK9-1096) or the max time (MYK9-1086) -- was denied at sync and
 * dead-lettered. The RPC authorizes managers, the class's assigned judge and a judge
 * passcode for the show. A class UPDATE that touches ONLY these columns is routed
 * there; anything else stays on the direct path, unchanged for secretaries.
 *
 * Mirror of ringsideEntryRpc.ts. `RINGSIDE_CLASS_RPC_KEYS` MUST match the SQL
 * allow-list in 20261011024300_myk9_1086_ringside_update_class.sql.
 */

export const RINGSIDE_CLASS_RPC_FUNCTION = 'ringside_update_class';

/** ReplicatedClass key → classes column the RPC accepts. */
const RINGSIDE_CLASS_RPC_KEYS: Readonly<Record<string, string>> = {
  classStatus: 'status',
  startTime: 'start_time',
  timeLimitSeconds: 'time_limit_seconds',
  time_limit_seconds: 'time_limit_seconds',
};

/** Local bookkeeping and system keys: never intent. */
const IGNORED_KEYS: ReadonlySet<string> = new Set([
  'id',
  'version',
  'updatedAt',
  '_lastModified',
  '_syncStatus',
]);

/** Statuses ringside sends. Cancelling a class is a manager action on the direct path. */
const RINGSIDE_STATUSES: ReadonlySet<unknown> = new Set([
  'upcoming',
  'setup',
  'in_progress',
  'completed',
]);

export interface RingsideClassRpc {
  name: string;
  idParam: 'p_class_id';
  fields: Record<string, unknown>;
}

/**
 * @param updateKeys - the keys the caller passed to updateClass.
 * @param supabaseRow - the snake_case row from toSupabaseRow (value source).
 * @returns the RPC routing for a ringside-only write, else null (direct UPDATE).
 */
export function buildRingsideClassRpc(
  updateKeys: string[],
  supabaseRow: Record<string, unknown>
): RingsideClassRpc | null {
  const columns = new Set<string>();
  for (const key of updateKeys) {
    if (IGNORED_KEYS.has(key)) continue;
    const column = RINGSIDE_CLASS_RPC_KEYS[key];
    if (!column) return null; // a non-ringside key → direct UPDATE
    columns.add(column);
  }
  if (columns.size === 0) return null;

  const fields: Record<string, unknown> = {};
  for (const column of columns) {
    fields[column] = supabaseRow[column] ?? null;
  }
  if ('status' in fields && !RINGSIDE_STATUSES.has(fields.status)) return null;

  return { name: RINGSIDE_CLASS_RPC_FUNCTION, idParam: 'p_class_id', fields };
}
