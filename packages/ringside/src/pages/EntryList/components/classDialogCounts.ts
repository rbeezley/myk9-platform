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
 * `completed_count` was the same bug with a second fault on top: the
 * `completedEntries` array is derived from the ALREADY TAB-FILTERED list, so it
 * is empty whenever the judge is looking at the Pending tab. A dialog opened
 * from Pending reported "0 completed" for a class that was half scored.
 *
 * Why this lives here and not in a shared rule module: the ringside `Entry`
 * type has no `entry_status`, `check_in_status`, `result_status` or
 * `deleted_at` — `transformEntry` collapses them into one display `status`.
 * The lifecycle rule cannot be evaluated inside this package at all, so the
 * package consumes the host's already-computed pair rather than owning a
 * second, weaker copy of it (the boundary decision MYK9-646 asked for).
 *
 * The raw lengths remain as the fallback for a consumer that supplies neither
 * half of the pair; there is no status set here to keep in sync either way.
 */

/** The two count fields on `ClassInfo` that carry the host's pair. */
export interface ClassDialogCountsSource {
  /** Entries the show still expects to put in the ring (the denominator). */
  totalEntries?: number | undefined;
  /** Expected entries that no longer represent outstanding scoring work. */
  completedEntries?: number | undefined;
}

export interface ClassDialogCounts {
  entry_count: number;
  completed_count: number;
}

/**
 * @param classInfo         the host's `ClassInfo`, or `null` before it loads
 * @param localEntries      every row the page holds (fallback denominator)
 * @param completedEntries  the tab-filtered completed rows (fallback numerator)
 */
export function classDialogCounts(
  classInfo: ClassDialogCountsSource | null | undefined,
  localEntries: readonly unknown[],
  completedEntries: readonly unknown[]
): ClassDialogCounts {
  return {
    entry_count: classInfo?.totalEntries ?? localEntries.length,
    completed_count: classInfo?.completedEntries ?? completedEntries.length,
  };
}
