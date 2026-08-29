/** Assembles Magazine presentation metadata around the canonical landing facts. */

import { useMemo } from 'react';
import type { Trial } from '@/components/trials/types/trial.types';
import { buildJourneySteps, toRoman } from '@/features/_shared/landing/landingData';
import { useLandingShowData } from '@/features/_shared/landing/useLandingShowData';
import type { Show } from '@/types/show-types';
import type { MagazineLandingData } from './types';

export function toLowerRoman(value: number | string | null | undefined): string {
  return toRoman(value).toLowerCase();
}

export function deriveMonogram(clubName: string): string {
  const trimmed = clubName.trim();
  if (!trimmed) return '·';
  const capitalWords = trimmed.split(/\s+/).filter(word => /^[A-Z]/.test(word));
  if (capitalWords.length > 0) {
    return capitalWords
      .slice(0, 3)
      .map(word => word.charAt(0))
      .join('');
  }
  return trimmed.slice(0, 2).toUpperCase();
}

export function deriveJudgeInitials(name: string): string {
  const tokens = name
    .replace(/\b(Miss|Mrs|Mr|Ms|Dr)\.?\s*/gi, '')
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return '·';
  return tokens
    .slice(0, 3)
    .map(token => token.charAt(0).toUpperCase())
    .join('');
}

export { buildJourneySteps };

const PLATE_LABELS = ['Plate I', 'Plate II', 'Plate III', 'Plate IV', 'Plate V', 'Plate VI'];

export function useMagazineLandingData(
  show: Show | null | undefined,
  currentTrial: Trial | null | undefined,
  allTrials: Trial[]
): MagazineLandingData {
  const shared = useLandingShowData(show, currentTrial, allTrials);

  return useMemo(
    () => ({
      ...shared,
      monogramLetters: deriveMonogram(shared.clubName),
      trials: shared.trials.map(trial => ({
        ...trial,
        ...(trial.judgeName ? { judge: trial.judgeName } : {}),
      })),
      judges: shared.judges.map((judge, index) => ({
        ...judge,
        trials: judge.trials.map(trial => trial.toLowerCase()),
        plateLabel: PLATE_LABELS[index] ?? `Plate ${index + 1}`,
        initials: deriveJudgeInitials(judge.name),
        portraitUrl: null,
      })),
      coverCaption: null,
      officers: [],
    }),
    [shared]
  );
}
