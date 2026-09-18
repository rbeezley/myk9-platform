/**
 * The entry counts the class dialogs describe (MYK9-646).
 *
 * The class page carries four numbers for one class: the Pending / Completed
 * badges, the class-details header, the class-list row it was reached from, and
 * the `entry_count` / `completed_count` on the class dialogs. The first three
 * report the host's canonical expected / accounted pair (`entryAccounting.ts`,
 * MYK9-645). The dialogs did not: `entry_count` was `localEntries.length` —
 * every row the page holds, withdrawn, scratched, moved and pulled ones
 * included — so the Requirements dialog read "66 entries" on a class whose
 * badges and header both said 65.
 *
 * `completed_count` was the same bug one hop earlier: the value handed to the
 * dialog slot came from the ALREADY TAB-FILTERED `completedEntries` array, so
 * on the Pending tab the slot received 0 whatever the class had scored. No
 * myK9Show dialog renders it today, which is why nobody saw it; it is now the
 * accounted count, so the first slot that does render it is right.
 *
 * Why this lives here and not in a shared rule module: the ringside `Entry`
 * type has no `entry_status`, `check_in_status`, `result_status` or
 * `deleted_at` — `transformEntry` collapses them into one display `status`.
 * The lifecycle rule cannot be evaluated inside this package at all, so the
 * package consumes the host's already-computed pair rather than owning a
 * second, weaker copy of it (the boundary decision MYK9-646 asked for).
 *
 * There is deliberately NO raw-length fallback. `buildClassInfo` calls the pair
 * "required, not optional, so a caller cannot silently fall back to raw
 * `entries.length`"; a `?? localEntries.length` arm here would re-open exactly
 * the door that comment closes, on a branch the product never reaches — every
 * dialog renders under `{classInfo && …}`. A host that cannot supply the pair
 * must fail to compile, not quietly render the wrong number.
 */

/** The host's expected / accounted pair, as `ClassInfo` carries it. */
export interface ClassDialogCountsSource {
  /** Entries the show still expects to put in the ring (the denominator). */
  totalEntries: number;
  /** Expected entries that no longer represent outstanding scoring work. */
  completedEntries: number;
}

/** The two count fields the dialog slots take, in their `classData` casing. */
export interface ClassDialogCounts {
  entry_count: number;
  completed_count: number;
}

/** Rename the host's pair into the `classData` shape the dialog slots take. */
export function classDialogCounts(classInfo: ClassDialogCountsSource): ClassDialogCounts {
  return {
    entry_count: classInfo.totalEntries,
    completed_count: classInfo.completedEntries,
  };
}
