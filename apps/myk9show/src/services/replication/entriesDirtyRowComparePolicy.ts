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
 * MYK9-1757: columns only a SERVER trigger writes. `check_in_pulled_by` says who flagged the
 * current pull; a device never writes it, so its copy differing from the server's (null vs
 * undefined vs 'staff') is staleness and must neither hold a dirty row for manual resolution nor
 * survive a reconcile. Both spellings the local row carries are listed.
 */
export const ENTRY_SERVER_OWNED_FIELDS = ['check_in_pulled_by', 'checkInPulledBy'] as const;

export const ENTRY_DIRTY_ROW_COMPARE_POLICY: DirtyRowComparePolicy = {
  serverOwnedFields: ENTRY_SERVER_OWNED_FIELDS,
  normalizeRemoteComparison: (_field, value) => (value === null ? undefined : value),
};
