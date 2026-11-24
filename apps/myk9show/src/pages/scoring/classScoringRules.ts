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

/** The current rule's fixed time in seconds (AKC Container Novice 2:00), else undefined. */
export function ruleFixedSeconds(cls: ReplicatedClass): number | undefined {
  return isRuleCurrent(cls.timeLimitRule, cls) ? cls.timeLimitRule.fixed || undefined : undefined;
}

/**
 * The one max time a class runs with (MYK9-2362): the saved time, else the rule's fixed time,
 * else 0 (no limit; a range rule leaves it to the judge). The scoresheet timer, its notice, the
 * Requirements card and the Show Desk header all read this.
 */
export function classMaxTimeSeconds(cls: ReplicatedClass): number {
  return cls.timeLimitSeconds || ruleFixedSeconds(cls) || 0;
}

export function classScoringRules(cls: ReplicatedClass): ResolvedClassRules {
  const rule = isRuleCurrent(cls.timeLimitRule, cls) ? cls.timeLimitRule : undefined;
  return buildResolvedClassRules({
    ...cls,
    timeLimitSeconds: classMaxTimeSeconds(cls),
    timerMode: classTimerMode(cls),
    thirtySecondWarning: rule?.thirtySecondWarning,
  });
}
