import type { SecretaryCockpitClass } from './secretaryCockpitTypes';

/**
 * Where a class is scored, in the words the Show Desk uses (MYK9-1971). One source for the class
 * switch and the judge-level choice, so the two never drift apart.
 */
export const SCORING_COPY = {
  paper: 'Scores on paper',
  phone: 'Scores on a phone',
  fieldLabel: 'Scoring',
  judgeGroupLabel: (judgeName: string) => `Every class ${judgeName} judges`,
  judgeHint: "Classes added to this judge later follow the show's setting.",
  mixed: 'Some classes are on paper and some are on a phone.',
  failed: 'Scoring could not be switched. Try again.',
} as const;

/**
 * The one rule for a class: its own choice, else the show's device-scoring switch. Mirrors
 * `resolveClaim` in ringside's runQueue and the server (`coalesce(scores_on_paper, NOT
 * uses_device_scoring)`). A show switch that is not known yet is not read as paper.
 */
export function isClassOnPaper(
  scoresOnPaper: boolean | null | undefined,
  showUsesDeviceScoring: boolean | null | undefined
): boolean {
  return scoresOnPaper ?? showUsesDeviceScoring === false;
}

/** A class that is over or off keeps how it was scored; the switch is not offered on it. */
export function canSwitchScoring(lifecycle: SecretaryCockpitClass['lifecycle']): boolean {
  return lifecycle !== 'complete' && lifecycle !== 'cancelled';
}

export type JudgeScoringState = 'paper' | 'phone' | 'mixed';

export interface JudgeScoringModel {
  /** The judge's classes the choice applies to (not complete, not cancelled). */
  targets: SecretaryCockpitClass[];
  state: JudgeScoringState | null;
}

/** The judge's classes in this show and how they are scored now; `state` is null with none to switch. */
export function judgeScoringModel(
  classes: readonly SecretaryCockpitClass[],
  judgeId: string,
  showUsesDeviceScoring: boolean | null | undefined
): JudgeScoringModel {
  const targets = classes.filter(cls => cls.judgeId === judgeId && canSwitchScoring(cls.lifecycle));
  if (targets.length === 0) return { targets, state: null };
  const paper = targets.filter(cls => isClassOnPaper(cls.scoresOnPaper, showUsesDeviceScoring));
  const state = paper.length === targets.length ? 'paper' : paper.length === 0 ? 'phone' : 'mixed';
  return { targets, state };
}
