/**
 * Tab strips for `/shows/:id` — extracted from ShowDetailsPage so the page file
 * stays under the 500-line ceiling and the counts are unit-testable.
 *
 * TWO strips live here, for two different audiences:
 * - `buildShowDetailTabDefs` — the public / exhibitor `?tab=` strip.
 * - `buildShowManagementTabDefs` — the secretary's ONE row of six tabs, each
 *   of which is a real page (MYK9-630 phase 2). The manager no longer has a
 *   `?tab=` strip at all, so the manager-only Entries and Show Map tabs are
 *   gone from the first builder.
 *
 * Every badge here is derived from the same data its panel renders. The
 * Results badge in particular must agree with the Podium panel: both count the
 * result groups returned by `useShowResults`, which reads
 * `view_public_entry_results` so unreleased placements never arrive (MYK9-419).
 */

import {
  LayoutDashboard,
  Trophy,
  ListChecks,
  ClipboardList,
  Medal,
  SlidersHorizontal,
  CalendarClock,
  FileText,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SHOW_TABS, type ShowTabId } from '@/routes/showManagementSections';
import { type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import type { ClassResult } from '@/hooks/queries/useShowResults';

/**
 * Result groups the Results tab will actually render as a podium — the same
 * `placements.length > 0` split PodiumContent uses. A group whose placements
 * were withheld by the release gate never reaches us, so it is not counted.
 */
export function countPlacedResultGroups(results: readonly ClassResult[] | undefined): number {
  if (!results) return 0;
  return results.filter(cls => cls.placements.length > 0).length;
}

/**
 * Resolve the Results badge. While the query is unresolved (loading, or it
 * failed) we return `undefined` so no badge renders at all — a confident `0`
 * over an unresolved read is the "disabled query reads as zero" trap.
 */
export function resolveResultsTabCount(query: {
  data?: readonly ClassResult[] | undefined;
  isLoading: boolean;
  isError: boolean;
}): number | undefined {
  if (query.isError) return undefined;
  if (query.isLoading || query.data === undefined) return undefined;
  return countPlacedResultGroups(query.data);
}

const SHOW_TAB_ICONS: Record<ShowTabId, LucideIcon> = {
  overview: LayoutDashboard,
  setup: SlidersHorizontal,
  entries: ClipboardList,
  'show-day': CalendarClock,
  results: Medal,
  reports: FileText,
};

export interface ShowDetailTabDefsInput {
  isAuthenticated: boolean;
  trialCount: number;
  classCount: number;
  submittedEntryHistoryCount: number;
  submittedEntryProjectionIsReady: boolean;
  /** `undefined` while the results read is unresolved — the badge is omitted. */
  resultsCount: number | undefined;
}

export function buildShowDetailTabDefs(input: ShowDetailTabDefsInput): PrimaryTabDef[] {
  return [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'trials', label: 'Trials', icon: Trophy, count: input.trialCount },
    ...(input.isAuthenticated
      ? [
          {
            id: 'my-entries',
            label: 'My Entries',
            icon: ClipboardList,
            ...(input.submittedEntryProjectionIsReady
              ? { count: input.submittedEntryHistoryCount }
              : {}),
          },
        ]
      : []),
    { id: 'classes', label: 'Classes', icon: ListChecks, count: input.classCount },
    {
      id: 'results',
      label: 'Results',
      icon: Medal,
      ...(input.resultsCount === undefined ? {} : { count: input.resultsCount }),
    },
  ];
}

export interface ShowManagementTabDefsInput {
  /** Entries this show has, from the ONE manager read (`secretaryEntries`). */
  catalogEntryCount: number;
  /** That read is loading or failed — the badge is omitted, never shown as 0. */
  managerEntryDataUnavailable: boolean;
  /** `undefined` while the results read is unresolved — the badge is omitted. */
  resultsCount: number | undefined;
}

/**
 * The secretary's six tabs. Badges keep the sources they had: Entries counts
 * the manager entry read the page already performed (so the badge and the body
 * below it cannot disagree — MYK9-630 AC3), Results counts released result
 * groups. Setup carries no badge: it absorbs three views with three different
 * counts, and those counts live on its own segmented control.
 */
export function buildShowManagementTabDefs(input: ShowManagementTabDefsInput): PrimaryTabDef[] {
  return SHOW_TABS.map(tab => {
    if (tab.id === 'entries') {
      return {
        id: tab.id,
        label: tab.label,
        icon: ClipboardList,
        ...(input.managerEntryDataUnavailable ? {} : { count: input.catalogEntryCount }),
      };
    }
    if (tab.id === 'results') {
      return {
        id: tab.id,
        label: tab.label,
        icon: Medal,
        ...(input.resultsCount === undefined ? {} : { count: input.resultsCount }),
      };
    }
    return { id: tab.id, label: tab.label, icon: SHOW_TAB_ICONS[tab.id] };
  });
}
