import { useMemo } from 'react';
import type { Trial } from '@/components/trials/types/trial.types';
import { useEntriesByShowQuery } from '@/hooks/queries/useEntriesDatabase';
import { useAuthContext } from '@/hooks/useAuthContext';
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
  const entryCount =
    !authLoading && user ? (entriesQuery.isError ? null : (entriesQuery.data?.length ?? 0)) : null;

  return useMemo(
    () => buildLandingData(show, currentTrial, allTrials, entryCount),
    [show, currentTrial, allTrials, entryCount]
  );
}
