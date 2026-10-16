import type { DirtyRowComparePolicy } from '@myk9/replication';

/**
 * MYK9-1236: a nullable entry column is the same value whether the local row
 * holds `null` or `undefined`. A ringside score writes `null` into the columns
 * it clears (`disqualification_reason`, area times), while a pull maps the
 * server's null column to `undefined` (`rowToEntry`). Compared plainly, a dirty
 * correction made on top of that `null` reads the pull as the server changing
 * the field, and the correction is held behind a conflict nobody caused.
 * Compare only: stored values are untouched. A real difference between two
 * non-null values still conflicts.
 */
export const ENTRY_DIRTY_ROW_COMPARE_POLICY: DirtyRowComparePolicy = {
  normalizeValue: (_field, value) => (value === null ? undefined : value),
};
