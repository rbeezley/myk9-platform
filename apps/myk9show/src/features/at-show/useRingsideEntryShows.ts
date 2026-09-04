/**
 * useRingsideEntryShows — wires the three role-self-gating data sources into the
 * pure `resolveRingsideEntry` function and enriches show names where possible.
 *
 * Used by `RingsideEntryPage` (the bare `/at-show` route) to decide whether to
 * auto-jump a signed-in user into their one live show or render the Ringside
 * home/chooser. Non-applicable roles' source hooks simply return empty.
 */

import { useMemo } from 'react';
import { format } from 'date-fns';
import { useJudgeAssignments } from '@/hooks/queries/useJudgeAssignments';
import { useShowTodayBanner } from '@/features/show-today/useShowTodayBanner';
import { useShowStore } from '@/store/showStore';
import { useMyShows } from '@/hooks/useMyShows';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useExhibitorUpcomingShows } from './useExhibitorUpcomingShows';
import {
  resolveRingsideEntry,
  type RingsideShowRef,
  type NamedShowSource,
} from './ringsideEntryResolver';
import { hasRingsideAccountShowAccess } from './ringsideAccountAccess';

export interface RingsideEntryShows {
  liveShows: RingsideShowRef[];
  upcomingShows: RingsideShowRef[];
  isLoading: boolean;
}

export function useRingsideEntryShows(): RingsideEntryShows {
  const { userWithRoles, hasRole } = useAuthContext();
  const judge = useJudgeAssignments();
  const banner = useShowTodayBanner();
  const shows = useShowStore(s => s.shows);
  // The manager source (useMyShows over the store) has no loading flag of its
  // own; fold in the store's so a secretary doesn't flash the "no live show"
  // home before the store hydrates and the auto-jump resolves.
  const showsLoading = useShowStore(s => s.isLoading);
  const managedShows = useMemo(
    () => shows.filter(show => hasRingsideAccountShowAccess(userWithRoles, hasRole, show)),
    [hasRole, shows, userWithRoles]
  );
  const { today, upcoming } = useMyShows(managedShows);
  // The exhibitor's own upcoming shows. `useShowTodayBanner` above covers only
  // TODAY, so without this an exhibitor resolved to zero shows on every day but
  // show day and the chooser fell through to its empty state.
  const exhibitorUpcomingShows = useExhibitorUpcomingShows();

  return useMemo(() => {
    const todayISO = format(new Date(), 'yyyy-MM-dd');

    const exhibitorToday: NamedShowSource[] = banner.items.map(i => ({
      showId: i.showId,
      showName: i.showName,
    }));
    const managerToday: NamedShowSource[] = today.map(s => ({ showId: s.id, showName: s.name }));
    const managerUpcoming: NamedShowSource[] = upcoming.map(s => ({
      showId: s.id,
      showName: s.name,
    }));

    const resolved = resolveRingsideEntry({
      judgeClasses: judge.assignments.map(a => ({
        showId: a.showId,
        status: a.status,
        trialDate: a.trialDate,
      })),
      exhibitorToday,
      exhibitorUpcoming: exhibitorUpcomingShows.upcomingShows,
      managerToday,
      managerUpcoming,
      todayISO,
    });

    // Best-effort name enrichment for nameless (judge-only) refs from any show
    // already in the store. Truly-unknown names stay null; the home renders a
    // generic label for those (a rare, low-stakes case — see resolver docstring).
    const nameById = new Map(shows.map(s => [s.id, s.name]));
    const enrich = (ref: RingsideShowRef): RingsideShowRef =>
      ref.showName ? ref : { ...ref, showName: nameById.get(ref.showId) ?? null };

    return {
      liveShows: resolved.liveShows.map(enrich),
      upcomingShows: resolved.upcomingShows.map(enrich),
      isLoading:
        judge.isLoading || banner.isLoading || showsLoading || exhibitorUpcomingShows.isLoading,
    };
  }, [
    judge.assignments,
    judge.isLoading,
    banner.items,
    banner.isLoading,
    exhibitorUpcomingShows.upcomingShows,
    exhibitorUpcomingShows.isLoading,
    today,
    upcoming,
    shows,
    showsLoading,
  ]);
}
