/**
 * Tab and sort-option builders for the entry list.
 *
 * Extracted during the MYK9-260 collapse so the single-class and combined A/B
 * modes cannot describe the same tabs two different ways. Pure functions rather
 * than components: the page memoises them, and they are cheap to test directly.
 */

import { StatusIcon, type Tab } from '@myk9/ui';
import { ArrowUpDown, Trophy } from 'lucide-react';
import type { Entry } from '../../stores/entryStore';
import type { FilterPanelSortOption } from './pageProps';

/** Which of the two combined sections the list is scoped to. */
export type SectionFilter = 'all' | 'A' | 'B';

/**
 * NOTE: counts come from `entryCounts` (derived from the FULL entry array),
 * never from `pendingEntries.length` / `completedEntries.length` — those are
 * derived from already tab-filtered entries, so the inactive tab reads 0.
 */
export function buildStatusTabs(entryCounts: { pending: number; completed: number }): Tab[] {
  return [
    {
      id: 'pending',
      label: 'Pending',
      icon: <StatusIcon family="entry" status="pending" size="sm" decorative />,
      count: entryCounts.pending,
    },
    {
      id: 'completed',
      label: 'Completed',
      icon: <StatusIcon family="entry" status="completed" size="sm" decorative />,
      count: entryCounts.completed,
    },
  ];
}

export function buildSectionTabs(entries: Entry[]): Tab[] {
  return [
    { id: 'all', label: 'All Sections', count: entries.length },
    { id: 'A', label: 'Section A', count: entries.filter(e => e.section === 'A').length },
    { id: 'B', label: 'Section B', count: entries.filter(e => e.section === 'B').length },
  ];
}

/**
 * `placement` is offered only on the Completed tab — sorting pending dogs by a
 * placement none of them has yet would order the ring by nothing.
 */
export function buildSortOptions(activeTab: string, isCombined: boolean): FilterPanelSortOption[] {
  const options: FilterPanelSortOption[] = [];
  if (isCombined) {
    options.push({
      value: 'section-armband',
      label: 'Section & Armband',
      icon: <ArrowUpDown size={16} />,
    });
  }
  options.push(
    { value: 'run', label: 'Run Order', icon: <ArrowUpDown size={16} /> },
    { value: 'armband', label: 'Armband', icon: <ArrowUpDown size={16} /> }
  );
  if (activeTab === 'completed') {
    options.push({ value: 'placement', label: 'Placement', icon: <Trophy size={16} /> });
  }
  return options;
}

/**
 * The sort a mode starts in, and therefore the one that does NOT count as an
 * active filter. Combined defaults to section-armband so A and B stay grouped.
 */
export function defaultSortOrder(isCombined: boolean): string {
  return isCombined ? 'section-armband' : 'run';
}
