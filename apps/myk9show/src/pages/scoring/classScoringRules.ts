/**
 * Scoring rules for a replicated class, with the parts of its rule cached at sync
 * (MYK9-1102: the 30-second warning). Every scoresheet route builds its rules here,
 * so one class times the same way on the ringside and the secretary's sheets.
 */
import { buildResolvedClassRules, type ResolvedClassRules } from '@myk9/scoring-ui';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import { isRuleCurrent } from '@/services/replication/resolveClassTimeLimitRules';

export function classScoringRules(cls: ReplicatedClass): ResolvedClassRules {
  const rule = isRuleCurrent(cls.timeLimitRule, cls) ? cls.timeLimitRule : undefined;
  return buildResolvedClassRules({ ...cls, thirtySecondWarning: rule?.thirtySecondWarning });
}
