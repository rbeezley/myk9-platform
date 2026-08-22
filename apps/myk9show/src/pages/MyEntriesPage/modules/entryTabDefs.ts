/**
 * Tab and status-filter definitions for the My Shows filter strip.
 *
 * The strip runs on ONE axis — time. Entry status sits beside it as a
 * composable filter. They were six sibling tabs until Phase A of
 * docs/plan-ia-exhibitor-surface.md; see `EntryTabFilter` for why that had to
 * change.
 *
 * @module MyEntriesPage/modules/entryTabDefs
 */

import { createElement } from 'react';
import { List, CalendarDays } from 'lucide-react';
import type { PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { StatusIcon } from '@/components/status';
import { isCompletedEntry } from './myEntriesStats.helpers';
import type { EntryStatusFilter, EntryTabFilter, MyEntry } from './my-entries-types';

export const ENTRY_TAB_DEFS = [
  { id: 'all', label: 'All', icon: List },
  { id: 'upcoming', label: 'Upcoming', icon: CalendarDays },
  {
    id: 'completed',
    label: 'Completed',
    icon: createElement(StatusIcon, {
      family: 'entry',
      status: 'completed',
      size: 'sm',
      decorative: true,
    }),
  },
] as const satisfies Omit<PrimaryTabDef, 'count'>[];

/**
 * What each tab MEANS, stated once.
 *
 * A tab label is a promise about what clicking it will show, so the list and
 * the badge above it have to answer the same question. They used to answer it
 * from two hand-maintained sites — a `switch` for the list and a separate set
 * of `.filter()` calls for the counts — kept in agreement by vigilance.
 * MYK9-208 was that agreement failing (the badge counted show dates while the
 * cards counted scores), and #1707 had to add a test asserting the two match.
 * Deriving both from this map makes the disagreement inexpressible instead of
 * merely tested for.
 *
 * `now` is a parameter rather than read inside: every caller in one render
 * must judge "completed" at the same instant, or a long-lived session crossing
 * a show's end date can put an entry in the list and out of the count.
 */
export const TAB_PREDICATES: Record<EntryTabFilter, (entry: MyEntry, now: Date) => boolean> = {
  all: () => true,
  // Strict complement of completed, so `upcoming + completed === all` holds by
  // construction — the partition invariant Phase A exists to create.
  upcoming: (entry, now) => !isCompletedEntry(entry, now),
  completed: (entry, now) => isCompletedEntry(entry, now),
};

/** The status chips shown beside the tabs. `any` is the default, first. */
export const ENTRY_STATUS_FILTER_DEFS = [
  { id: 'any', label: 'Any status' },
  { id: 'pending', label: 'Pending' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'waitlist', label: 'Waitlist' },
] as const satisfies { id: EntryStatusFilter; label: string }[];

/**
 * Narrows an untrusted `?tab=` value to a real tab id. Derived from
 * ENTRY_TAB_DEFS rather than a second hand-written list, so adding a tab cannot
 * leave the URL reader behind. An unknown value falls back to 'all' at the call
 * site instead of rendering an empty list for a typo'd or stale link.
 */
export function isEntryTabFilter(value: string | null | undefined): value is EntryTabFilter {
  return !!value && ENTRY_TAB_DEFS.some(tab => tab.id === value);
}

/** Narrows an untrusted `?status=` value; unknown falls back to 'any'. */
export function isEntryStatusFilter(value: string | null | undefined): value is EntryStatusFilter {
  return !!value && ENTRY_STATUS_FILTER_DEFS.some(status => status.id === value);
}

/**
 * `?tab=pending|accepted|waitlist` used to be real tabs. Those links are still
 * in the wild — bookmarks, the summary stat cards, `EntriesEmptyState` CTAs —
 * and a bare `isEntryTabFilter` check would drop them to 'all', silently
 * discarding the filter the link was written to apply.
 *
 * Returns the status filter a legacy tab id now means, or undefined if the
 * value was never a status tab.
 */
export function legacyTabAsStatusFilter(
  value: string | null | undefined
): EntryStatusFilter | undefined {
  if (value === 'pending' || value === 'accepted' || value === 'waitlist') return value;
  return undefined;
}
