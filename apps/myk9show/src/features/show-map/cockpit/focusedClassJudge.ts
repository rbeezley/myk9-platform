import { normalizeJudgeId } from '@/components/classes/useClassJudgeAssignment';
import type {
  CockpitLifecycle,
  EvidenceValue,
  SecretaryCockpitClass,
  SecretaryCockpitSnapshot,
} from './secretaryCockpitTypes';

/**
 * The class panel's judge picker is open only before the class starts (MYK9-1323). Once a class
 * is running, its score sheets and the judge's day carry that judge, so a mis-tap on show day
 * must not swap them; Edit class stays the way to change it then. A lifecycle the cockpit
 * cannot read counts as started.
 */
export function isJudgeChangeLocked(lifecycle: EvidenceValue<CockpitLifecycle>): boolean {
  return judgeLockReason(lifecycle) !== null;
}

/** Why the judge cannot be changed here, in the panel's words; null while it can. */
export function judgeLockReason(lifecycle: EvidenceValue<CockpitLifecycle>): string | null {
  switch (lifecycle.value) {
    case 'not-started':
      return null;
    case 'in-progress':
    case 'complete':
      return 'Locked once the class starts. Use Edit class to change it.';
    case 'cancelled':
      return 'This class is cancelled. Use Edit class to change it.';
    default:
      return "Locked until the class's status loads. Use Edit class to change it.";
  }
}

/**
 * The snapshot with each class carrying the judge just assigned from the panel, until
 * replication catches the class row up. The schedule row and the panel both read the
 * snapshot, so neither shows the old judge in the meantime. Returns the same snapshot when
 * nothing differs, so memoised readers do not rebuild.
 */
export function withAssignedJudges(
  snapshot: SecretaryCockpitSnapshot,
  judgeIdFor: (cls: SecretaryCockpitClass) => string | null,
  judgeNameFor: (judgeId: string) => string | null
): SecretaryCockpitSnapshot {
  let changed = false;
  const classes = snapshot.classes.map(cls => {
    const judgeId = judgeIdFor(cls);
    if (judgeId === normalizeJudgeId(cls.judgeId)) return cls;
    changed = true;
    const judgeName = judgeId === null ? null : judgeNameFor(judgeId);
    return { ...cls, judgeId, judgeName };
  });
  return changed ? { ...snapshot, classes } : snapshot;
}
