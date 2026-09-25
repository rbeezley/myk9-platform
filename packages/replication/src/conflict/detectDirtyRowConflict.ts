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

/**
 * MYK9-740: the fields of each replicated table's LOCAL row that hold a
 * `timestamptz` (verified against the live schema on 2026-09-25). Local entry
 * rows carry both the column name and a camelCase copy (`scoring_completed_at`
 * and `scoringCompletedAt`, see ReplicatedEntriesTable.mapper.ts), so both
 * are listed, plus the denormalized `shows.deleted_at`. Only these fields
 * compare as instants (so `…Z` equals `…+00:00`). Every other field compares
 * as text, including text columns that happen to hold ISO-shaped strings
 * (`judge_notes`, `trials.actual_start_time`), whose different spellings are
 * different values (Codex P2 on PR #2436). A table missing here keeps plain
 * text comparison, the behavior before MYK9-740.
 */
const INSTANT_FIELDS_BY_TABLE: Readonly<Record<string, ReadonlySet<string>>> = {
  entries: new Set([
    'confirmation_email_sent_at',
    'createdAt',
    'created_at',
    'deletedAt',
    'deleted_at',
    'judge_signature_timestamp',
    'last_synced_at',
    'refundedAt',
    'refund_decided_at',
    'refunded_at',
    'ring_entry_time',
    'ring_exit_time',
    'scoringCompletedAt',
    'scoring_completed_at',
    'scoring_started_at',
    'showDeletedAt',
    'show_deleted_at',
    'submittedAt',
    'submitted_at',
    'updated_at',
    'withdrawn_at',
  ]),
};

const NO_INSTANT_FIELDS: ReadonlySet<string> = new Set();

/** The fields of `tableName` that hold instants; empty for an unlisted table. */
export function instantFieldsFor(tableName: string): ReadonlySet<string> {
  return INSTANT_FIELDS_BY_TABLE[tableName] ?? NO_INSTANT_FIELDS;
}

export interface DirtyRowConflictInput<T extends object> {
  base: T;
  local: T;
  remote: T;
  ignoredFields?: Iterable<string>;
  /** Fields compared as instants; see {@link instantFieldsFor}. Default: none. */
  instantFields?: ReadonlySet<string>;
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
  instantFields = NO_INSTANT_FIELDS,
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
    const asInstant = instantFields.has(field);
    const localChanged = !deepEqual(localValue, baseValue, asInstant);
    const remoteChanged = !deepEqual(remoteValue, baseValue, asInstant);
    const sidesDiffer = !deepEqual(localValue, remoteValue, asInstant);

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
  instantFields = NO_INSTANT_FIELDS,
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
    const asInstant = instantFields.has(field);
    const localChanged = !deepEqual(localValue, baseValue, asInstant);
    const remoteChanged = !deepEqual(remoteValue, baseValue, asInstant);

    // Server changed a field the client never touched → adopt the server value.
    if (remoteChanged && !localChanged) {
      merged[field] = remoteValue;
      appliedFields.push(field);
    }
  }

  return { merged: merged as T, appliedFields: appliedFields.sort() };
}

function deepEqual(left: unknown, right: unknown, asInstant: boolean): boolean {
  if (Object.is(left, right)) return true;
  if (asInstant && isSameInstant(left, right)) return true;
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
