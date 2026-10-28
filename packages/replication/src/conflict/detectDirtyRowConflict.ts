export const DEFAULT_IGNORED_FIELDS: ReadonlySet<string> = new Set([
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
  // MYK9-1445: Release results stamps `results_released_at` with `toISOString()` (`…Z`)
  // under both spellings; the server's echo reads `…+00:00`, which as text is a
  // same-field conflict against the secretary's own write.
  classes: new Set([
    'judgeSignedOffAt',
    'judge_signed_off_at',
    'reopenedAfterCloseoutAt',
    'reopened_after_closeout_at',
    'resultsReleasedAt',
    'results_released_at',
    'resultsVerifiedAt',
    'results_verified_at',
  ]),
};

const NO_INSTANT_FIELDS: ReadonlySet<string> = new Set();

/** The fields of `tableName` that hold instants; empty for an unlisted table. */
export function instantFieldsFor(tableName: string): ReadonlySet<string> {
  return INSTANT_FIELDS_BY_TABLE[tableName] ?? NO_INSTANT_FIELDS;
}

/**
 * MYK9-1104: how a table lets one device action and a server action that
 * reached the same outcome read as agreement, not a same-field collision.
 */
export interface DirtyRowComparePolicy {
  /**
   * Map a field's value to the server's spelling before comparing, so two
   * spellings of one value (`Completed` / `completed`) are equal. Applied to
   * base, local and remote alike. Compare only; stored values are untouched.
   */
  normalizeValue?: (field: string, value: unknown) => unknown;
  /**
   * MYK9-1236: like `normalizeValue`, but applied ONLY where a value read from the
   * server is compared with the base (did the SERVER change this field?), and where
   * the server's row is compared with a write of this device that has landed. Never
   * to a comparison involving the device's own value: the device writing `null` over
   * an `undefined` base is a real write, and calling it a no-op lets a stale clear
   * overwrite another device's value. Runs after `normalizeValue`.
   */
  normalizeRemoteComparison?: (field: string, value: unknown) => unknown;
  /**
   * Fields the server stamps as a by-product of the outcome (a completion time).
   * When the device and the server each changed one to a different value and
   * every OTHER collision on the row has converged (some other field changed on
   * both sides to the same value, and none still differs), the server's value
   * wins without a prompt. Never waives a collision on its own: with no
   * converged field beside it, or any other field still differing, the row is
   * still surfaced.
   */
  serverWinsFields?: readonly string[];
  /**
   * MYK9-1327: fields that hold ONE value between them (a class's judge is its id, name parts
   * and resolved flag). The 3-way merge keeps a group whole: when the device changed any field
   * of a group, every field of that group keeps the device's value, so a part that happened
   * to equal the base cannot be taken from the server and leave a half-replaced value.
   */
  fieldGroups?: readonly (readonly string[])[];
}

export interface DirtyRowConflictInput<T extends object> {
  base: T;
  local: T;
  remote: T;
  ignoredFields?: Iterable<string>;
  /** Fields compared as instants; see {@link instantFieldsFor}. Default: none. */
  instantFields?: ReadonlySet<string>;
  /** See {@link DirtyRowComparePolicy}. Default: plain comparison. */
  comparePolicy?: DirtyRowComparePolicy;
}

export interface DirtyRowConflictResult {
  hasConflict: boolean;
  fields: string[];
  /**
   * Fields to take from the server snapshot when the row reconciles instead of
   * surfacing: converged fields held under a different spelling, plus any
   * waived server-wins fields. Absent when there are none.
   */
  adoptRemoteFields?: string[];
}

export function detectDirtyRowConflict<T extends object>({
  base,
  local,
  remote,
  ignoredFields = DEFAULT_IGNORED_FIELDS,
  instantFields = NO_INSTANT_FIELDS,
  comparePolicy,
}: DirtyRowConflictInput<T>): DirtyRowConflictResult {
  const ignored = new Set(ignoredFields);
  const normalize = comparePolicy?.normalizeValue;
  const serverWins = new Set(comparePolicy?.serverWinsFields ?? []);
  const respelled: string[] = [];
  let agreedFields = 0;
  const fields = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  const conflicts: string[] = [];
  const baseRecord = base as Record<string, unknown>;
  const localRecord = local as Record<string, unknown>;
  const remoteRecord = remote as Record<string, unknown>;

  for (const field of fields) {
    if (ignored.has(field)) continue;

    const asInstant = instantFields.has(field);
    const baseValue = normalize ? normalize(field, baseRecord[field]) : baseRecord[field];
    const localValue = normalize ? normalize(field, localRecord[field]) : localRecord[field];
    const remoteValue = normalize ? normalize(field, remoteRecord[field]) : remoteRecord[field];
    const localChanged = !deepEqual(localValue, baseValue, asInstant);
    const remoteChanged = !deepEqual(
      remoteComparable(comparePolicy, field, remoteValue),
      remoteComparable(comparePolicy, field, baseValue),
      asInstant
    );
    const sidesDiffer = !deepEqual(localValue, remoteValue, asInstant);

    if (localChanged && remoteChanged && sidesDiffer) {
      conflicts.push(field);
    } else if (localChanged && remoteChanged) {
      // Both sides moved the field to the same value.
      agreedFields++;
      // Same value, different spelling: the row holds the device's spelling.
      if (!deepEqual(localRecord[field], remoteRecord[field], asInstant)) respelled.push(field);
    }
  }

  const waivable =
    conflicts.length > 0 && agreedFields > 0 && conflicts.every(field => serverWins.has(field));
  if (waivable) {
    return {
      hasConflict: false,
      fields: [],
      adoptRemoteFields: [...respelled, ...conflicts].sort(),
    };
  }

  const adopt = conflicts.length > 0 ? [] : respelled.sort();
  return {
    hasConflict: conflicts.length > 0,
    fields: conflicts.sort(),
    ...(adopt.length > 0 && { adoptRemoteFields: adopt }),
  };
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
  comparePolicy,
}: DirtyRowConflictInput<T>): DirtyRowMergeResult<T> {
  const ignored = new Set(ignoredFields);
  const fields = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  const baseRecord = base as Record<string, unknown>;
  const localRecord = local as Record<string, unknown>;
  const remoteRecord = remote as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...localRecord };
  const appliedFields: string[] = [];
  // A field of a group the device changed (any member) keeps the device's value: see fieldGroups.
  const deviceOwned = new Set<string>();
  for (const group of comparePolicy?.fieldGroups ?? []) {
    const changed = group.some(
      field => !deepEqual(localRecord[field], baseRecord[field], instantFields.has(field))
    );
    if (changed) for (const field of group) deviceOwned.add(field);
  }

  for (const field of fields) {
    if (ignored.has(field) || deviceOwned.has(field)) continue;

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

/** A value as the policy reads it when compared on the server's side; see `normalizeRemoteComparison`. */
export function remoteComparable(
  policy: DirtyRowComparePolicy | undefined,
  field: string,
  value: unknown
): unknown {
  const normalize = policy?.normalizeRemoteComparison;
  return normalize ? normalize(field, value) : value;
}

export function deepEqual(left: unknown, right: unknown, asInstant: boolean): boolean {
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
