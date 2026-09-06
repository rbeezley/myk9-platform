/**
 * Tab strip for `/shows/:id` — extracted from ShowDetailsPage so the page file
 * stays under the 500-line ceiling and the counts are unit-testable.
 *
 * Every badge here is derived from the same data its panel renders. The
 * Results badge in particular must agree with the Podium panel: both count the
 * result groups returned by `useShowResults`, which reads
 * `view_public_entry_results` so unreleased placements never arrive (MYK9-419).
 */

import { LayoutDashboard, Trophy, ListChecks, ClipboardList, Medal, ListTree } from 'lucide-react';
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

export interface ShowDetailTabDefsInput {
  isAuthenticated: boolean;
  canShowMap: boolean;
  canManageShow: boolean;
  trialCount: number;
  classCount: number;
  catalogEntryCount: number;
  managerEntryDataUnavailable: boolean;
  submittedEntryHistoryCount: number;
  submittedEntryProjectionIsReady: boolean;
  /** `undefined` while the results read is unresolved — the badge is omitted. */
  resultsCount: number | undefined;
}

export function buildShowDetailTabDefs(input: ShowDetailTabDefsInput): PrimaryTabDef[] {
  return [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    ...(input.canShowMap ? [{ id: 'map', label: 'Show Map', icon: ListTree }] : []),
    { id: 'trials', label: 'Trials', icon: Trophy, count: input.trialCount },
    ...(!input.canManageShow && input.isAuthenticated
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
    ...(input.canManageShow && input.isAuthenticated
      ? [
          {
            id: 'my-entries',
            label: 'Entries',
            icon: ClipboardList,
            ...(input.managerEntryDataUnavailable ? {} : { count: input.catalogEntryCount }),
          },
        ]
      : []),
    {
      id: 'results',
      label: 'Results',
      icon: Medal,
      ...(input.resultsCount === undefined ? {} : { count: input.resultsCount }),
    },
  ];
}
