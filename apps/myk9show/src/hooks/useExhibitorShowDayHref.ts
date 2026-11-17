import { useCallback, useMemo } from 'react';
import { useShowTrials } from '@/hooks/queries/useShowTrials';
import { getTrialTimezone } from '@/features/registries';
import { exhibitorShowDayHref } from '@/utils/exhibitorShowDayLink';

/**
 * Link builder for an exhibitor's entry rows on the show page (MYK9-2134): My
 * Shows before the trial day, Ringside on it. The trial's zone comes from the
 * replicated trials read; a trial not loaded yet has no zone and so goes to
 * My Shows.
 */
export function useExhibitorShowDayHref(showId: string) {
  const { data: trials } = useShowTrials(showId);
  const timezoneByTrialId = useMemo(
    () => new Map((trials ?? []).map(trial => [trial.id, getTrialTimezone(trial)])),
    [trials]
  );
  return useCallback(
    (entry: { trialId: string; trialDate: string }) =>
      exhibitorShowDayHref({
        showId,
        trialDate: entry.trialDate,
        timezone: timezoneByTrialId.get(entry.trialId),
      }),
    [showId, timezoneByTrialId]
  );
}
