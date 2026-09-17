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
export function buildStatusTabs(
  entryCounts: { pending: number; completed: number },
  /**
   * Counts supplied by the host (`ClassInfo.statusCounts`). When present they
   * WIN outright -- the host has the lifecycle fields (`entry_status`,
   * `check_in_status`, `result_status`, `deleted_at`) that the transformed
   * `Entry` no longer carries, so its pair is the authoritative one and the
   * tabs must not disagree with the header it also feeds (MYK9-645).
   */
  passedCounts?: { pending: number; completed: number } | undefined
): Tab[] {
  const counts = passedCounts ?? entryCounts;
  return [
    {
      id: 'pending',
      label: 'Pending',
      icon: <StatusIcon family="entry" status="pending" size="sm" decorative />,
      count: counts.pending,
    },
    {
      id: 'completed',
      label: 'Completed',
      icon: <StatusIcon family="entry" status="completed" size="sm" decorative />,
      count: counts.completed,
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
