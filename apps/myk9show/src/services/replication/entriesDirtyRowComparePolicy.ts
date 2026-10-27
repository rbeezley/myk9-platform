import type { DirtyRowComparePolicy } from '@myk9/replication';

/**
 * MYK9-1236: base `null` against remote `undefined` is one server value read
 * through two mappers: the optimistic ringside write stores `null`, `rowToEntry`
 * maps the same null column to `undefined`. So the server did not change it, and a
 * dirty correction made on top must not be held behind a conflict nobody caused.
 *
 * Server side only. The device's own value is compared raw: writing `null` over an
 * `undefined` base is a real write, and a no-op reading of it would let a stale
 * clear overwrite another device's value. A real difference between two non-null
 * values still conflicts.
 */
/**
 * MYK9-1396: the stored pre-Pull check-in reads as "nothing remembered" three
 * ways: an explicit NULL (the trigger's stamp when check_in_status was NULL), the
 * mapper's `no-status` default for that same NULL (what the local mirror stamps,
 * since the replica row cannot tell the two apart), and an absent column on a
 * row cached before the migration. Restore treats them identically
 * (`stored ?? 'no-status'`), so they compare equal; a real value still differs.
 */
const BEFORE_PULL_FIELDS: ReadonlySet<string> = new Set([
  'checkInStatusBeforePull',
  'check_in_status_before_pull',
]);

export const ENTRY_DIRTY_ROW_COMPARE_POLICY: DirtyRowComparePolicy = {
  normalizeValue: (field, value) =>
    BEFORE_PULL_FIELDS.has(field) && (value === undefined || value === 'no-status') ? null : value,
  normalizeRemoteComparison: (_field, value) => (value === null ? undefined : value),
};
