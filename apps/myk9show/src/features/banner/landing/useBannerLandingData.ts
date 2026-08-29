/** Assembles Banner presentation metadata around the canonical landing facts. */

import { useMemo } from 'react';
import type { Trial } from '@/components/trials/types/trial.types';
import { useLandingShowData } from '@/features/_shared/landing/useLandingShowData';
import type { Show } from '@/types/show-types';
import { useBannerBrandColor } from '../hooks/useBannerBrandColor';
import type { BannerJudge, BannerLandingData } from './types';

function pad2(value: number | string): string {
  const number = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isNaN(number) ? String(value) : number.toString().padStart(2, '0');
}

export function useBannerLandingData(
  show: Show | null | undefined,
  currentTrial: Trial | null | undefined,
  allTrials: Trial[]
): BannerLandingData {
  const shared = useLandingShowData(show, currentTrial, allTrials);
  const brandColors = useBannerBrandColor(show);

  return useMemo(() => {
    const judges: BannerJudge[] = shared.judges.map(judge => {
      const trials = shared.trials
        .filter(trial => trial.judgeName === judge.name)
        .map(trial => pad2(trial.trialNumber));
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
      label: fee.label === 'Day-of entry' ? 'Each additional' : fee.label,
      sub: fee.label === 'Day-of entry' ? 'same dog, additional trials' : 'per dog, per trial',
    }));

    return {
      ...shared,
      brandColors,
      judges,
      fees,
      officers: [],
      onTheDay: [],
    };
  }, [shared, brandColors]);
}
