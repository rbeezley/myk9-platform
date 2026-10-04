import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Trial } from '@/components/trials/types/trial.types';
import { useEntriesByShowQuery } from '@/hooks/queries/useEntriesDatabase';
import { useAuthContext } from '@/hooks/useAuthContext';
import { isAccountSession } from '@/hooks/guestServerRead';
import { fetchShowConfirmedJudgeAssignments } from '@/services/database/_shared/judgeNamesByClass';
import { fetchPublicEntryCountsByShow } from '@/services/database/_shared/entryCounts';
import type { Show } from '@/types/show-types';
import { buildLandingData, type LandingData, type LandingJudgesState } from './landingData';

export function useLandingShowData(
  show: Show | null | undefined,
  currentTrial: Trial | null | undefined,
  allTrials: Trial[]
): LandingData {
  const showId = show?.id ?? '';
  const { user, loading: authLoading } = useAuthContext();
  const isAuthenticatedUser = isAccountSession(user);
  const entriesQuery = useEntriesByShowQuery(
    showId,
    !!showId && isAuthenticatedUser && !authLoading
  );
  const publicClassIds = useMemo(
    () =>
      (show?.trials ?? []).flatMap(trial => (trial.classes ?? []).map(classInfo => classInfo.id)),
    [show?.trials]
  );
  const publicCountsQuery = useQuery({
    queryKey: ['public-show-entry-counts', showId, publicClassIds.join(',')],
    queryFn: () =>
      fetchPublicEntryCountsByShow(showId, publicClassIds, 'select_landing_entry_counts'),
    enabled: !!showId && !authLoading && !isAuthenticatedUser && publicClassIds.length > 0,
    staleTime: 60_000,
  });
  // MYK9-985: judges come from get_show_judges (the one anon-callable judge-name path;
  // `people` is not readable by guests, so a judge_assignments -> people embed is empty for them).
  const judgesQuery = useQuery({
    queryKey: ['public-show-judges', showId],
    queryFn: async () => {
      const assignments = await fetchShowConfirmedJudgeAssignments(showId);
      // null = the read failed: throw so React Query retries instead of caching "no judges".
      if (assignments === null) throw new Error('get_show_judges failed');
      return assignments;
    },
    enabled: !!showId,
    staleTime: 60_000,
  });
  const judgeAssignments = judgesQuery.data;
  // Retained data from an earlier success stays `ready` even if a refetch fails.
  const judgesState: LandingJudgesState = judgeAssignments
    ? 'ready'
    : judgesQuery.isError
      ? 'error'
      : 'loading';
  const entryCount = useMemo(() => {
    if (authLoading) return null;
    if (isAuthenticatedUser) return entriesQuery.isError ? null : (entriesQuery.data?.length ?? 0);
    if (publicCountsQuery.isError || !publicCountsQuery.data) return null;
    return [...publicCountsQuery.data.values()].reduce((total, count) => total + count.total, 0);
  }, [
    authLoading,
    entriesQuery.data,
    entriesQuery.isError,
    publicCountsQuery.data,
    publicCountsQuery.isError,
    isAuthenticatedUser,
  ]);

  return useMemo(
    () =>
      buildLandingData(show, currentTrial, allTrials, entryCount, judgeAssignments, judgesState),
    [show, currentTrial, allTrials, entryCount, judgeAssignments, judgesState]
  );
}
