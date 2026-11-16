/**
 * Scoring rules for a replicated class, with the parts of its rule cached at sync
 * (MYK9-1102: the 30-second warning). Every scoresheet route builds its rules here,
 * so one class times the same way on the ringside and the secretary's sheets.
 */
import { buildResolvedClassRules, type ResolvedClassRules } from '@myk9/scoring-ui';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import { isRuleCurrent } from '@/services/replication/resolveClassTimeLimitRules';

/**
 * The class's timer mode (MYK9-2016): the current rule's, else the one copied onto the
 * class. The one place the scoresheet and the class info panel both read it.
 */
export function classTimerMode(cls: ReplicatedClass): string | undefined {
  const display = isRuleCurrent(cls.timeLimitRule, cls) ? cls.timeLimitRule.display : undefined;
  return display?.timerMode ?? cls.timerMode;
}

export function classScoringRules(cls: ReplicatedClass): ResolvedClassRules {
  const rule = isRuleCurrent(cls.timeLimitRule, cls) ? cls.timeLimitRule : undefined;
  return buildResolvedClassRules({
    ...cls,
    timerMode: classTimerMode(cls),
    thirtySecondWarning: rule?.thirtySecondWarning,
  });
}
