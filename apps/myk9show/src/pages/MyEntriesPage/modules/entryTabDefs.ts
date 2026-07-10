/**
 * Tab definitions for the My Shows entries filter strip. Extracted from
 * `index.tsx` (task 4.7) to keep the page shell under the 500-line ratchet.
 *
 * @module MyEntriesPage/modules/entryTabDefs
 */

import { List, Clock, CheckCircle, Users, CalendarDays, CircleCheck } from 'lucide-react';
import type { PrimaryTabDef } from '@/components/common/PrimaryTabs';

export const ENTRY_TAB_DEFS = [
  { id: 'all', label: 'All', icon: List },
  { id: 'pending', label: 'Pending', icon: Clock },
  { id: 'accepted', label: 'Accepted', icon: CheckCircle },
  { id: 'waitlist', label: 'Waitlist', icon: Users },
  { id: 'upcoming', label: 'Upcoming', icon: CalendarDays },
  { id: 'completed', label: 'Completed', icon: CircleCheck },
] as const satisfies Omit<PrimaryTabDef, 'count'>[];
