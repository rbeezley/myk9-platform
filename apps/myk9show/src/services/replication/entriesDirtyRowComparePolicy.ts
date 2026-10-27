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
export const ENTRY_DIRTY_ROW_COMPARE_POLICY: DirtyRowComparePolicy = {
  normalizeRemoteComparison: (_field, value) => (value === null ? undefined : value),
};
