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
import type { EntryStatusFilter, EntryTabFilter } from './my-entries-types';

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
