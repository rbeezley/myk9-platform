/**
 * Gazette Entry Blank — prop types.
 *
 * The Gazette entry blank consumes the same `EntryBlankProps` interface as
 * Heritage by deliberate design: `buildEntryBlankProps` is re-exported from
 * Heritage rather than forked (see reconciliation notes §Reuse, don't fork).
 *
 * This module exists so a downstream caller doesn't need to import from
 * `features/heritage/...` to know what props the Gazette PDF expects.
 */

export type {
  EntryBlankProps,
  EntryBlankDog,
  EntryBlankOwner,
  EntryBlankFees,
  EntryBlankMailTo,
  EntryBlankTrialRow,
  EntryBlankLevelCell,
} from '@/features/heritage/entry-blank/types';
