/**
 * Whether My Shows renders its When / Status filter rail (MYK9-1286).
 *
 * The rail answers "how many rows are in each bucket", a secretary's question.
 * An exhibitor with one or two shows asks "what is next for me", so they see
 * the list alone; the rail appears from the third show. A `?tab=` / `?status=`
 * deep link keeps it visible regardless, so the narrowing stays visible and can
 * be undone (MYK9-657).
 *
 * @module MyEntriesPage/modules/entryFilterStripVisibility
 */

import { useState } from 'react';
import type { EntryStatusFilter, EntryTabFilter, MyEntry } from './my-entries-types';

/** Distinct shows at which the filter rail starts to earn its place. */
export const FILTER_STRIP_MIN_SHOWS = 3;

/** Distinct shows across ALL of the exhibitor's entries, never the filtered subset. */
export function countDistinctShows(entries: readonly Pick<MyEntry, 'showId'>[]): number {
  return new Set(entries.map(entry => entry.showId)).size;
}

export function shouldShowEntryFilterStrip(args: {
  distinctShowCount: number;
  selectedTab: EntryTabFilter;
  selectedStatus: EntryStatusFilter;
}): boolean {
  return (
    args.distinctShowCount >= FILTER_STRIP_MIN_SHOWS ||
    args.selectedTab !== 'all' ||
    args.selectedStatus !== 'any'
  );
}

/**
 * `shouldShowEntryFilterStrip`, latched open for the rest of the mount.
 *
 * An exhibitor with two shows who arrives on `?tab=completed` sees the rail;
 * pressing "All" undoes the narrowing, and the un-latched rule would unmount
 * the rail under the focused chip, dropping focus to the body (MYK9-1286).
 * Latched during render (no effect), so the rail never flickers closed.
 */
export function useEntryFilterStripVisible(
  args: Parameters<typeof shouldShowEntryFilterStrip>[0]
): boolean {
  const [latched, setLatched] = useState(false);
  const visible = shouldShowEntryFilterStrip(args);
  // React's "adjust state while rendering" pattern: the flip is one-way and settles in one pass.
  if (visible && !latched) setLatched(true);
  return visible || latched;
}
