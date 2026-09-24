const DEFAULT_IGNORED_FIELDS = new Set([
  'id',
  'created_at',
  'updated_at',
  '_version',
  '_lastModified',
  '_lastModifiedBy',
  '_syncStatus',
  '_localOnly',
]);

export interface DirtyRowConflictInput<T extends object> {
  base: T;
  local: T;
  remote: T;
  ignoredFields?: Iterable<string>;
}

export interface DirtyRowConflictResult {
  hasConflict: boolean;
  fields: string[];
}

export function detectDirtyRowConflict<T extends object>({
  base,
  local,
  remote,
  ignoredFields = DEFAULT_IGNORED_FIELDS,
}: DirtyRowConflictInput<T>): DirtyRowConflictResult {
  const ignored = new Set(ignoredFields);
  const fields = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  const conflicts: string[] = [];
  const baseRecord = base as Record<string, unknown>;
  const localRecord = local as Record<string, unknown>;
  const remoteRecord = remote as Record<string, unknown>;

  for (const field of fields) {
    if (ignored.has(field)) continue;

    const baseValue = baseRecord[field];
    const localValue = localRecord[field];
    const remoteValue = remoteRecord[field];
    const localChanged = !deepEqual(localValue, baseValue);
    const remoteChanged = !deepEqual(remoteValue, baseValue);
    const sidesDiffer = !deepEqual(localValue, remoteValue);

    if (localChanged && remoteChanged && sidesDiffer) {
      conflicts.push(field);
    }
  }

  return { hasConflict: conflicts.length > 0, fields: conflicts.sort() };
}

export interface DirtyRowMergeResult<T> {
  /** `local` with server-changed-but-client-untouched fields adopted from `remote`. */
  merged: T;
  /** Sorted field names that were taken from `remote`. */
  appliedFields: string[];
}

/**
 * Complement of {@link detectDirtyRowConflict}: for a dirty row with NO same-field
 * conflict, adopt the server's value for every field the server changed (remote ≠
 * base) but the client left untouched (local == base). Fields the client changed
 * keep the local (optimistic) value. Same-field divergences are NOT handled here —
 * those are a conflict and must be surfaced via {@link detectDirtyRowConflict}.
 *
 * This is the missing three-way merge that lets a dirty sync-down advance its OCC
 * token without clobbering server-authoritative fields on the next full-row write
 * (root-cause fix for the ringside conflict storm — see
 * docs/plan-replication-stale-occ-token-sync.md).
 */
export function mergeNonConflictingServerFields<T extends object>({
  base,
  local,
  remote,
  ignoredFields = DEFAULT_IGNORED_FIELDS,
}: DirtyRowConflictInput<T>): DirtyRowMergeResult<T> {
  const ignored = new Set(ignoredFields);
  const fields = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  const baseRecord = base as Record<string, unknown>;
  const localRecord = local as Record<string, unknown>;
  const remoteRecord = remote as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...localRecord };
  const appliedFields: string[] = [];

  for (const field of fields) {
    if (ignored.has(field)) continue;

    const baseValue = baseRecord[field];
    const localValue = localRecord[field];
    const remoteValue = remoteRecord[field];
    const localChanged = !deepEqual(localValue, baseValue);
    const remoteChanged = !deepEqual(remoteValue, baseValue);

    // Server changed a field the client never touched → adopt the server value.
    if (remoteChanged && !localChanged) {
      merged[field] = remoteValue;
      appliedFields.push(field);
    }
  }

  return { merged: merged as T, appliedFields: appliedFields.sort() };
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (isSameInstant(left, right)) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * An ISO-8601 date-time that names its zone (`Z` or `±hh:mm`). Only these are
 * unambiguous instants; a zone-less or date-only string depends on the device's
 * timezone and keeps comparing as text.
 */
const ZONED_ISO_INSTANT =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?)(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * MYK9-740: the client stamps timestamps with `toISOString()` (`…Z`) while
 * PostgREST returns `timestamptz` as `…+00:00`. When the server echoes a write
 * this client already made, the two spellings name the same instant and must
 * not read as a same-field conflict.
 */
function isSameInstant(left: unknown, right: unknown): boolean {
  const leftInstant = parseZonedInstant(left);
  const rightInstant = parseZonedInstant(right);
  if (!leftInstant || !rightInstant) return false;
  return leftInstant.ms === rightInstant.ms && leftInstant.subMs === rightInstant.subMs;
}

/**
 * Split an instant into whole epoch milliseconds plus the sub-millisecond
 * digits. `Date.parse` truncates to milliseconds, but Postgres `timestamptz`
 * keeps microseconds, and two values inside one millisecond are different
 * values — so the extra digits are compared separately, trailing zeros ignored.
 */
function parseZonedInstant(value: unknown): { ms: number; subMs: string } | null {
  if (typeof value !== 'string') return null;
  const match = ZONED_ISO_INSTANT.exec(value);
  if (!match) return null;
  const [, dateTime = '', fraction = '', zone = ''] = match;
  const hasSeconds = dateTime.length > 'YYYY-MM-DDTHH:MM'.length;
  const millis = hasSeconds ? `.${fraction.padEnd(3, '0').slice(0, 3)}` : '';
  const ms = Date.parse(`${dateTime}${millis}${zone}`);
  if (!Number.isFinite(ms)) return null;
  return { ms, subMs: fraction.slice(3).replace(/0+$/, '') };
}
