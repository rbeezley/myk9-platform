/**
 * Tab definitions for the My Shows entries filter strip. Extracted from
 * `index.tsx` (task 4.7) to keep the page shell under the 500-line ratchet.
 *
 * @module MyEntriesPage/modules/entryTabDefs
 */

import { createElement } from 'react';
import { List, CalendarDays } from 'lucide-react';
import type { PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { StatusIcon } from '@/components/status';
import type { EntryTabFilter } from './my-entries-types';

export const ENTRY_TAB_DEFS = [
  { id: 'all', label: 'All', icon: List },
  {
    id: 'pending',
    label: 'Pending',
    icon: createElement(StatusIcon, {
      family: 'entry',
      status: 'pending',
      size: 'sm',
      decorative: true,
    }),
  },
  {
    id: 'accepted',
    label: 'Accepted',
    icon: createElement(StatusIcon, {
      family: 'entry',
      status: 'accepted',
      size: 'sm',
      decorative: true,
    }),
  },
  {
    id: 'waitlist',
    label: 'Waitlist',
    icon: createElement(StatusIcon, {
      family: 'entry',
      status: 'waitlist',
      size: 'sm',
      decorative: true,
    }),
  },
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
 * Narrows an untrusted `?tab=` value to a real tab id. Derived from
 * ENTRY_TAB_DEFS rather than a second hand-written list, so adding a tab cannot
 * leave the URL reader behind. An unknown value falls back to 'all' at the call
 * site instead of rendering an empty list for a typo'd or stale link.
 */
export function isEntryTabFilter(value: string | null | undefined): value is EntryTabFilter {
  return !!value && ENTRY_TAB_DEFS.some(tab => tab.id === value);
}
