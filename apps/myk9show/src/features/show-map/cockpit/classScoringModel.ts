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
  usualWay: "(the show's usual way)",
  judgeLater: (usual: 'paper' | 'phone' | null) =>
    `A class you give this judge later is scored the show's usual way${
      usual ? ` (${usual === 'paper' ? 'on paper' : 'on a phone'})` : ''
    }.`,
  judgeReach: (count: number, judgeName: string) =>
    `Applies to ${count === 1 ? '1 class' : `${count} classes`} ${judgeName} judges, on every day of this show.`,
  judgeMixed: (paper: number, phone: number) => `${paper} on paper, ${phone} on a phone.`,
  judgeSkipped: (count: number) =>
    `${count === 1 ? '1 finished or cancelled class stays' : `${count} finished or cancelled classes stay`} as ${count === 1 ? 'it is' : 'they are'}.`,
  failed: 'Scoring could not be switched. Try again.',
} as const;

/** The show's usual way, or null while the show's switch is not known. */
export function showUsualWay(
  showUsesDeviceScoring: boolean | null | undefined
): 'paper' | 'phone' | null {
  if (showUsesDeviceScoring == null) return null;
  return showUsesDeviceScoring ? 'phone' : 'paper';
}

/**
 * The one rule for a class: its own choice, else the show's device-scoring switch. Mirrors
 * `resolveClaim` in ringside's runQueue and the server (`coalesce(scores_on_paper, NOT
 * uses_device_scoring)`). `null` is unknown (the class follows a show whose switch has not
 * loaded): never read as a phone, so the panel shows neither choice pressed.
 */
export function isClassOnPaper(
  scoresOnPaper: boolean | null | undefined,
  showUsesDeviceScoring: boolean | null | undefined
): boolean | null {
  if (scoresOnPaper != null) return scoresOnPaper;
  const usual = showUsualWay(showUsesDeviceScoring);
  return usual === null ? null : usual === 'paper';
}

/** A class that is over or off keeps how it was scored; the switch is not offered on it. */
export function canSwitchScoring(lifecycle: SecretaryCockpitClass['lifecycle']): boolean {
  return lifecycle !== 'complete' && lifecycle !== 'cancelled';
}

export type JudgeScoringState = 'paper' | 'phone' | 'mixed' | 'unknown';

export interface JudgeScoringModel {
  /** The judge's classes the choice applies to (not complete, not cancelled), across the whole show. */
  targets: SecretaryCockpitClass[];
  /** The judge's classes the choice leaves alone. */
  skipped: number;
  paperCount: number;
  phoneCount: number;
  state: JudgeScoringState | null;
}

/** The judge's classes in this show and how they are scored now; `state` is null with none to switch. */
export function judgeScoringModel(
  classes: readonly SecretaryCockpitClass[],
  judgeId: string,
  showUsesDeviceScoring: boolean | null | undefined
): JudgeScoringModel {
  const theirs = classes.filter(cls => cls.judgeId === judgeId);
  const targets = theirs.filter(cls => canSwitchScoring(cls.lifecycle));
  const skipped = theirs.length - targets.length;
  const ways = targets.map(cls => isClassOnPaper(cls.scoresOnPaper, showUsesDeviceScoring));
  const paperCount = ways.filter(way => way === true).length;
  const phoneCount = ways.filter(way => way === false).length;
  if (targets.length === 0) return { targets, skipped, paperCount, phoneCount, state: null };
  const state: JudgeScoringState =
    paperCount > 0 && phoneCount > 0
      ? 'mixed'
      : paperCount + phoneCount < targets.length
        ? 'unknown'
        : paperCount > 0
          ? 'paper'
          : 'phone';
  return { targets, skipped, paperCount, phoneCount, state };
}
