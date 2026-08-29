/** Assembles Gazette presentation metadata around the canonical landing facts. */

import { useMemo } from 'react';
import type { Trial } from '@/components/trials/types/trial.types';
import { buildJourneySteps, toRoman } from '@/features/_shared/landing/landingData';
import { useLandingShowData } from '@/features/_shared/landing/useLandingShowData';
import type { Show } from '@/types/show-types';
import {
  GAZETTE_DEFAULT_EDITION,
  GAZETTE_DEFAULT_MOTTO,
  GAZETTE_DEFAULT_VOLUME_ROMAN,
} from '../tokens';
import type { GazetteAccommodation, GazetteLandingData } from './types';

export { buildJourneySteps };

export function useGazetteLandingData(
  show: Show | null | undefined,
  currentTrial: Trial | null | undefined,
  allTrials: Trial[]
): GazetteLandingData {
  const shared = useLandingShowData(show, currentTrial, allTrials);

  return useMemo(() => {
    const accommodations: GazetteAccommodation[] = shared.accommodations.map(
      (accommodation, index) => ({
        ...accommodation,
        type: 'Lodging',
        meta: `LODGING · ${toRoman(index + 1)}`,
      })
    );
    if (shared.vetClinic) {
      accommodations.push({
        ...shared.vetClinic,
        type: 'Emergency Vet',
        meta: 'VET · EMERGENCY',
      });
    }

    return {
      ...shared,
      trials: shared.trials.map(trial => ({
        ...trial,
        ...(trial.judgeName ? { judge: trial.judgeName } : {}),
      })),
      judges: shared.judges.map(judge => ({
        ...judge,
        trials: judge.trials.map(trial => trial.toLowerCase()),
        hall: null,
        bio: null,
      })),
      trialChairTitle: null,
      volumeRoman: GAZETTE_DEFAULT_VOLUME_ROMAN,
      edition: GAZETTE_DEFAULT_EDITION,
      motto: GAZETTE_DEFAULT_MOTTO,
      established: null,
      cityLabel: null,
      accommodations,
      schedule: [],
      officers: [],
      secretaryPhone: null,
    };
  }, [shared]);
}
