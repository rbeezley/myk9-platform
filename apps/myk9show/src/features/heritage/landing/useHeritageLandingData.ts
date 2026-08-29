/** Assembles the Heritage view model from the canonical public-landing facts. */

import { useMemo } from 'react';
import type { Trial } from '@/components/trials/types/trial.types';
import { buildJourneySteps, toRoman } from '@/features/_shared/landing/landingData';
import { useLandingShowData } from '@/features/_shared/landing/useLandingShowData';
import type { Show } from '@/types/show-types';
import type { HeritageLandingData } from './types';

export { buildJourneySteps, toRoman };

export function useHeritageLandingData(
  show: Show | null | undefined,
  currentTrial: Trial | null | undefined,
  allTrials: Trial[]
): HeritageLandingData {
  const shared = useLandingShowData(show, currentTrial, allTrials);

  return useMemo(
    () => ({
      ...shared,
      trials: shared.trials.map(trial => ({
        ...trial,
        ...(trial.judgeName ? { judge: trial.judgeName } : {}),
      })),
      officers: [],
    }),
    [shared]
  );
}
