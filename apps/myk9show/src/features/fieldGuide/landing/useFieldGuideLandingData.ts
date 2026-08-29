/** Assembles Field Guide presentation metadata around the canonical landing facts. */

import { useMemo } from 'react';
import type { Trial } from '@/components/trials/types/trial.types';
import { useLandingShowData } from '@/features/_shared/landing/useLandingShowData';
import type { Show } from '@/types/show-types';
import type { FieldGuideJudge, FieldGuideLandingData, FieldGuideQuickRefCell } from './types';
import { formatDateInTimezone, formatDateRange } from './utils/dateFormat';
import { deriveShowCode } from './utils/showCode';

function pad2(value: number | string): string {
  const number = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isNaN(number) ? String(value) : number.toString().padStart(2, '0');
}

export function useFieldGuideLandingData(
  show: Show | null | undefined,
  currentTrial: Trial | null | undefined,
  allTrials: Trial[]
): FieldGuideLandingData {
  const shared = useLandingShowData(show, currentTrial, allTrials);

  return useMemo(() => {
    const showCode = deriveShowCode(shared.clubName, shared.showName, shared.trialStartDate);
    const judges: FieldGuideJudge[] = shared.judges.map(judge => {
      const trials = shared.trials
        .filter(trial => trial.judgeName === judge.name)
        .map(trial => pad2(trial.trialNumber));
      return {
        id: judge.id,
        name: judge.name,
        trialsLabel: trials.length > 0 ? `TRIALS ${trials.join('·')}` : null,
        trials: judge.trials,
        elements: judge.elements,
        city: judge.city ?? null,
        elementPanel: null,
        bio: null,
      };
    });
    const quickRefCells: FieldGuideQuickRefCell[] = [
      {
        label: 'DATES',
        value:
          formatDateRange(shared.trialStartDate, shared.trialEndDate, shared.timezone) || 'TBA',
      },
      {
        label: 'OPENS',
        value: shared.entryOpenDate
          ? formatDateInTimezone(shared.entryOpenDate, shared.timezone, 'monthDay')
          : 'TBA',
      },
      {
        label: 'CLOSES',
        value: shared.entryCloseDate
          ? formatDateInTimezone(shared.entryCloseDate, shared.timezone, 'monthDay')
          : 'TBA',
        emphasis: true,
      },
      {
        label: 'CONFIRM',
        value: shared.confirmationDate
          ? formatDateInTimezone(shared.confirmationDate, shared.timezone, 'monthDay')
          : 'TBA',
      },
      { label: 'CAP', value: shared.entryLimit == null ? 'OPEN' : String(shared.entryLimit) },
    ];
    const fees = shared.fees.map(fee => ({
      ...fee,
      label: fee.label.toUpperCase(),
      sub: fee.label === 'Day-of entry' ? 'PER DOG / DAY OF SHOW' : 'PER DOG / PER TRIAL',
    }));

    return {
      ...shared,
      showCode,
      showSubtitle: `FIELD GUIDE · ${showCode} · REV 01`,
      trialChairEmail: null,
      judges,
      quickRefCells,
      fees,
      officers: [],
      onTheDay: [],
    };
  }, [shared]);
}
