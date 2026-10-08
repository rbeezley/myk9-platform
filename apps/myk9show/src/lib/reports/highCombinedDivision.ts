import { AKC_SCENT_WORK_LEVELS } from './entryFormTypes';
import type { ReportEntry } from './types';
import { buildCombinedAward, buildHighInTrial, HIT_ELEMENTS } from './highInTrial';
import type { HighInTrialClassLike, HighInTrialModel } from './highInTrial';

export const HCD_ELEMENTS = [...HIT_ELEMENTS, 'Handler Discrimination'] as const;
export type HcdElement = (typeof HCD_ELEMENTS)[number];

/**
 * AKC Scent Work Regulations amended August 2025, Chapter 6 §§9–10, pp. 43–44.
 * HCD accompanies a trial offering HIT and HD. Every available
 * odor element plus HD must qualify; summed faults, time, then a human coin flip rank
 * teams. §10 permits limited offerings: one level may count only one odor plus HD,
 * provided the trial offers HIT. Do not import HIT's per-level two-odor minimum.
 * The shared engine preserves missing-score, cancellation and non-participation rules.
 */
export function buildHighCombinedDivision(input: {
  entries: readonly ReportEntry[];
  classes: readonly HighInTrialClassLike[];
}): HighInTrialModel<HcdElement> {
  const hitClasses = input.classes.filter(cls =>
    (AKC_SCENT_WORK_LEVELS as readonly string[]).includes(cls.level.trim())
  );
  if (buildHighInTrial({ ...input, classes: hitClasses }).levels.length === 0)
    return { levels: [], exclusions: [] };
  return buildCombinedAward(input, {
    elements: HCD_ELEMENTS,
    minimumElements: 2,
    requiredElement: 'Handler Discrimination',
    knownLevelsOnly: true,
    scoredOnly: true,
  });
}
