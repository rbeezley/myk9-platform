import type { FocusedClassModel } from './secretaryCockpitTypes';

/**
 * The class panel's judge picker is open only before the class starts (MYK9-1323). Once a class
 * is running, its score sheets and the judge's day carry that judge, so a mis-tap on show day
 * must not swap them; Edit class stays the way to change it then. A lifecycle the cockpit
 * cannot read counts as started.
 */
export function isJudgeChangeLocked(focused: JudgeLockInput): boolean {
  return judgeLockReason(focused) !== null;
}

/** What the lock reads: the class's status, plus the evidence that it began anyway. */
export type JudgeLockInput = Pick<FocusedClassModel, 'lifecycle' | 'progress' | 'actualStart'>;

/** Why the judge cannot be changed here, in the panel's words; null while it can. */
export function judgeLockReason({
  lifecycle,
  progress,
  actualStart,
}: JudgeLockInput): string | null {
  // A ringside device that is behind on sync leaves the status at not-started while dogs are
  // already scored; a recorded start or a scored dog means the class began.
  const begun = Boolean(actualStart.value) || (progress.value?.completed ?? 0) > 0;
  switch (lifecycle.value) {
    case 'not-started':
      return begun ? 'Locked once the class starts. Use Edit class to change it.' : null;
    case 'in-progress':
    case 'complete':
      return 'Locked once the class starts. Use Edit class to change it.';
    case 'cancelled':
      return 'This class is cancelled. Use Edit class to change it.';
    default:
      return "Locked until the class's status loads. Use Edit class to change it.";
  }
}
