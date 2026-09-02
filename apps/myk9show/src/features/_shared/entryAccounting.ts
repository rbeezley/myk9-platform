/**
 * Canonical answer to "is this entry expected to be scored, and has it been?"
 *
 * These are the decisions recorded in migration
 * `20260712180000_class_status_auto_derivation.sql` (D1/D2), which the server
 * uses to auto-derive class completion:
 *
 *   expected  = entry_status NOT IN ('scratched','withdrawn','moved',
 *                                   'not_accepted')
 *               AND check_in_status IS DISTINCT FROM 'pulled'
 *   accounted = is_scored = true OR result_status IN ('absent','excused')
 *   complete  = expected > 0 AND accounted = expected
 *
 * Any surface that reports outstanding scoring work must use these, not its own
 * variant. A second, subtly different rule is how a page ends up disagreeing
 * with the server about whether a class is finished — the readiness block on
 * `/shows/:showId/results-control` did exactly that (MYK9-118).
 *
 * The parameter type is structural so both the replicated row shape and the
 * class store's `SyncableEntryData` satisfy it without conversion.
 */

/**
 * Lifecycle states meaning the entry is not expected to run.
 *
 * `moved` and `not_accepted` are as terminal as the other three, and leaving
 * them out was MYK9-330: a move-up leaves the SOURCE row live in the original
 * class (`showMapActionMutations` creates the destination entry and marks the
 * original `moved` — deliberately not soft-deleted, so the exhibitor can still
 * see where the run came from), so it sat in the expected set forever, was
 * never scored, and the class could never reach `accounted === expected`.
 *
 * `cancelled` was dropped in the same change: `entries_entry_status_check` has
 * never permitted it, so it only made this list look longer than the rule.
 */
const EXCLUDED_ENTRY_STATUSES = new Set([
  'scratched',
  'withdrawn',
  'moved',
  'not_accepted',
]);

/**
 * Result states that settle an entry without a score. Deliberately narrow:
 * anything actually scored carries `is_scored`, and `result_status` defaults to
 * `'pending'`, so a broader match would count untouched entries as done.
 */
const ACCOUNTED_RESULT_STATUSES = new Set(['absent', 'excused']);

/** Fields the rules read, in either casing the mappers emit. */
export interface EntryAccountingFields {
  deletedAt?: string | null | undefined;
  deleted_at?: string | null | undefined;
  entryStatus?: string | undefined;
  entry_status?: string | undefined;
  status?: string | undefined;
  checkInStatus?: string | undefined;
  check_in_status?: string | undefined;
  isScored?: boolean | undefined;
  is_scored?: boolean | undefined;
  resultStatus?: string | undefined;
  result_status?: string | undefined;
}

function normalized(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

/** True when the entry is one the show still expects to put in the ring. */
export function isExpectedEntry(entry: EntryAccountingFields): boolean {
  if (entry.deletedAt != null || entry.deleted_at != null) return false;

  const entryStatus = normalized(entry.entryStatus ?? entry.entry_status ?? entry.status);
  const checkInStatus = normalized(entry.checkInStatus ?? entry.check_in_status);
  return !EXCLUDED_ENTRY_STATUSES.has(entryStatus) && checkInStatus !== 'pulled';
}

/** True when the entry no longer represents outstanding scoring work. */
export function isAccountedFor(entry: EntryAccountingFields): boolean {
  const resultStatus = normalized(entry.resultStatus ?? entry.result_status);
  return (
    entry.isScored === true ||
    entry.is_scored === true ||
    ACCOUNTED_RESULT_STATUSES.has(resultStatus)
  );
}

/** Entries the show expects to run, in input order. */
export function expectedEntries<T extends EntryAccountingFields>(entries: T[]): T[] {
  return entries.filter(isExpectedEntry);
}

/** Expected entries that still need a result. */
export function outstandingEntries<T extends EntryAccountingFields>(entries: T[]): T[] {
  return expectedEntries(entries).filter(entry => !isAccountedFor(entry));
}
