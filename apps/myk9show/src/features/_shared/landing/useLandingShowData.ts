import { useMemo } from 'react';
import type { Trial } from '@/components/trials/types/trial.types';
import { useEntriesByShowQuery } from '@/hooks/queries/useEntriesDatabase';
import type { Show } from '@/types/show-types';
import { buildLandingData, type LandingData } from './landingData';

export function useLandingShowData(
  show: Show | null | undefined,
  currentTrial: Trial | null | undefined,
  allTrials: Trial[]
): LandingData {
  const showId = show?.id ?? '';
  const entriesQuery = useEntriesByShowQuery(showId, !!showId);
  const entryCount = entriesQuery.isError ? null : (entriesQuery.data?.length ?? 0);

  return useMemo(
    () => buildLandingData(show, currentTrial, allTrials, entryCount),
    [show, currentTrial, allTrials, entryCount]
  );
}
