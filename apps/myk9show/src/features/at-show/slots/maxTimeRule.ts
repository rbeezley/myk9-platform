/**
 * The range a judge may set for this class's max time, checked BEFORE the time is
 * applied locally: ringside_update_class refuses anything outside it at upload,
 * and an out-of-range time applied offline would time the dogs until then.
 */
import { replicatedClassesTable } from '@/services/replication';
import {
  resolveTimeLimitRulesForClassRows,
  timeLimitRuleRange,
  type TimeLimitRule,
} from '@/services/replication/resolveClassTimeLimitRules';

export type MaxTimeRange = { low: number; high: number } | 'unknown-offline';

export async function maxTimeRangeForClass(classId: string): Promise<MaxTimeRange> {
  const cls = await replicatedClassesTable.get(classId);
  let rule: TimeLimitRule | undefined = cls?.timeLimitRule;
  if (!rule) {
    // Synced before rules were cached, or a class with no rule. Only the server
    // can tell those apart, so ask it -- and never guess offline.
    if (!navigator.onLine) return 'unknown-offline';
    const rules = await resolveTimeLimitRulesForClassRows([
      {
        id: classId,
        trial_id: cls?.trialId ?? null,
        element: cls?.element ?? null,
        level: cls?.level ?? null,
      },
    ]);
    rule = rules.get(classId);
  }
  return timeLimitRuleRange(rule);
}
