/**
 * The range a judge may set for this class's max time, checked BEFORE the time is
 * applied locally: ringside_update_class refuses anything outside it at upload,
 * and an out-of-range time applied offline would time the dogs until then.
 *
 * Works offline from the rule cached on the class at sync -- but only while that
 * rule is for the class's CURRENT element and level. Otherwise it asks the server,
 * and refuses rather than guesses when offline or when the lookup fails.
 */
import { useEffect, useState } from 'react';
import { replicatedClassesTable } from '@/services/replication';
import {
  type TimeLimitRule,
  isRuleCurrent,
  resolveTimeLimitRulesForClassRows,
  timeLimitRuleRange,
} from '@/services/replication/resolveClassTimeLimitRules';

/**
 * `fixed` is set when the rulebook decides the time (UKC, ASCA Open, AKC fixed
 * elements); `judgeSet` when the judge chooses within min..max (MYK9-1101).
 */
export interface KnownMaxTimeRange {
  low: number;
  high: number;
  fixed?: number | undefined;
  judgeSet: boolean;
}

export type MaxTimeRange = KnownMaxTimeRange | 'unknown-offline' | 'lookup-failed';

function describe(rule: TimeLimitRule): KnownMaxTimeRange {
  return {
    ...timeLimitRuleRange(rule),
    fixed: rule.fixed || undefined,
    judgeSet: !rule.fixed && !!rule.min && !!rule.max,
  };
}

export async function maxTimeRangeForClass(classId: string): Promise<MaxTimeRange> {
  const cls = await replicatedClassesTable.get(classId);
  if (!cls) return 'lookup-failed';
  if (isRuleCurrent(cls.timeLimitRule, cls)) return describe(cls.timeLimitRule);

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
  return rule ? describe(rule) : 'lookup-failed';
}

/** The class's range for the open dialog; null while it loads (MYK9-1101). */
export function useMaxTimeRange(classId: string): MaxTimeRange | null {
  const [range, setRange] = useState<MaxTimeRange | null>(null);
  useEffect(() => {
    let cancelled = false;
    maxTimeRangeForClass(classId)
      .catch((): MaxTimeRange => 'lookup-failed')
      .then(result => {
        if (!cancelled) setRange(result);
      });
    return () => {
      cancelled = true;
    };
  }, [classId]);
  return range;
}
