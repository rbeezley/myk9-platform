/**
 * The range a judge may set for this class's max time, checked BEFORE the time is
 * applied locally: ringside_update_class refuses anything outside it at upload,
 * and an out-of-range time applied offline would time the dogs until then.
 *
 * Works offline from the rule cached on the class at sync -- but only while that
 * rule is for the class's CURRENT element and level. Otherwise it asks the server,
 * and refuses rather than guesses when offline or when the lookup fails.
 */
import { replicatedClassesTable } from '@/services/replication';
import {
  isRuleCurrent,
  resolveTimeLimitRulesForClassRows,
  timeLimitRuleRange,
} from '@/services/replication/resolveClassTimeLimitRules';

export type MaxTimeRange = { low: number; high: number } | 'unknown-offline' | 'lookup-failed';

export async function maxTimeRangeForClass(classId: string): Promise<MaxTimeRange> {
  const cls = await replicatedClassesTable.get(classId);
  if (!cls) return 'lookup-failed';
  if (isRuleCurrent(cls.timeLimitRule, cls)) return timeLimitRuleRange(cls.timeLimitRule);

  if (!navigator.onLine) return 'unknown-offline';
  const rules = await resolveTimeLimitRulesForClassRows([
    {
      id: classId,
      trial_id: cls.trialId ?? null,
      element: cls.element ?? null,
      level: cls.level ?? null,
    },
  ]).catch(() => null);
  const rule = rules?.get(classId);
  return rule ? timeLimitRuleRange(rule) : 'lookup-failed';
}
