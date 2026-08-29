/** Assembles Poster presentation metadata around the canonical landing facts. */

import { useMemo } from 'react';
import type { Trial } from '@/components/trials/types/trial.types';
import { useLandingShowData } from '@/features/_shared/landing/useLandingShowData';
import type { Show } from '@/types/show-types';
import type { PosterJudge, PosterLandingData } from './types';
import { padTrialNumber } from './utils/dateFormat';

export function usePosterLandingData(
  show: Show | null | undefined,
  currentTrial: Trial | null | undefined,
  allTrials: Trial[]
): PosterLandingData {
  const shared = useLandingShowData(show, currentTrial, allTrials);

  return useMemo(() => {
    const judges: PosterJudge[] = shared.judges.map(judge => {
      const trials = shared.trials
        .filter(trial => trial.judgeName === judge.name)
        .map(trial => padTrialNumber(trial.trialNumber));
      return {
        id: judge.id,
        name: judge.name,
        trialsLabel: trials.length > 0 ? `TRIALS ${trials.join(' · ')}` : null,
        trials: judge.trials,
        elements: judge.elements,
        city: judge.city ?? null,
        elementPanel: null,
        bio: null,
      };
    });
    const fees = shared.fees.map(fee => ({
      ...fee,
      sub: fee.label === 'Day-of entry' ? 'per dog, day of show' : 'per dog, per trial',
    }));

    return {
      ...shared,
      judges,
      fees,
      officers: [],
      onTheDay: [],
    };
  }, [shared]);
}
