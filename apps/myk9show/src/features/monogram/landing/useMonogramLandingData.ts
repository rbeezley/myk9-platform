/** Assembles Monogram presentation metadata around the canonical landing facts. */

import { useMemo } from 'react';
import type { Trial } from '@/components/trials/types/trial.types';
import { useLandingShowData } from '@/features/_shared/landing/useLandingShowData';
import type { Show } from '@/types/show-types';
import { buildMonogram } from '../utils/buildMonogram';
import type { MonogramLandingData } from './types';

export function useMonogramLandingData(
  show: Show | null | undefined,
  currentTrial: Trial | null | undefined,
  allTrials: Trial[]
): MonogramLandingData {
  const shared = useLandingShowData(show, currentTrial, allTrials);

  return useMemo(
    () => ({
      ...shared,
      monogramLetters: buildMonogram(shared.clubName || shared.showName, 3),
      judges: shared.judges.map(judge => ({
        id: judge.id,
        name: judge.name,
        initials: buildMonogram(judge.name, 2),
        trials: judge.trials,
        city: judge.city ?? null,
        elements: judge.elements,
        credential: null,
        bio: null,
      })),
      fees: shared.fees,
      officers: [],
    }),
    [shared]
  );
}
