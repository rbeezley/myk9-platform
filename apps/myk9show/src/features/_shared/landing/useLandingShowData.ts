import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Trial } from '@/components/trials/types/trial.types';
import { useEntriesByShowQuery } from '@/hooks/queries/useEntriesDatabase';
import { useAuthContext } from '@/hooks/useAuthContext';
import { fetchPublicEntryCountsByShow } from '@/services/database/_shared/entryCounts';
import type { Show } from '@/types/show-types';
import { buildLandingData, type LandingData } from './landingData';

export function useLandingShowData(
  show: Show | null | undefined,
  currentTrial: Trial | null | undefined,
  allTrials: Trial[]
): LandingData {
  const showId = show?.id ?? '';
  const { user, loading: authLoading } = useAuthContext();
  const entriesQuery = useEntriesByShowQuery(showId, !!showId && !!user && !authLoading);
  const publicClassIds = useMemo(
    () =>
      (show?.trials ?? []).flatMap(trial => (trial.classes ?? []).map(classInfo => classInfo.id)),
    [show?.trials]
  );
  const publicCountsQuery = useQuery({
    queryKey: ['public-show-entry-counts', showId, publicClassIds.join(',')],
    queryFn: () =>
      fetchPublicEntryCountsByShow(showId, publicClassIds, 'select_landing_entry_counts'),
    enabled: !!showId && !authLoading && !user && publicClassIds.length > 0,
    staleTime: 60_000,
  });
  const entryCount = useMemo(() => {
    if (authLoading) return null;
    if (user) return entriesQuery.isError ? null : (entriesQuery.data?.length ?? 0);
    if (publicCountsQuery.isError || !publicCountsQuery.data) return null;
    return [...publicCountsQuery.data.values()].reduce((total, count) => total + count.total, 0);
  }, [
    authLoading,
    entriesQuery.data,
    entriesQuery.isError,
    publicCountsQuery.data,
    publicCountsQuery.isError,
    user,
  ]);

  return useMemo(
    () => buildLandingData(show, currentTrial, allTrials, entryCount),
    [show, currentTrial, allTrials, entryCount]
  );
}
