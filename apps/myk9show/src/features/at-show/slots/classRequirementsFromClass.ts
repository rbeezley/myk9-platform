/**
 * Class requirements for ringside, offline (MYK9-1100): from the class's rule as
 * cached on it at sync (resolveClassTimeLimitRules), falling back to the values
 * copied onto the class when it was created for a rule cached before that.
 */
import { formatTimeLimitSeconds } from '@myk9/core';
import { formatIntRange, type ClassRequirements } from '@/hooks/queries/useClassRequirements';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import { isRuleCurrent } from '@/services/replication/resolveClassTimeLimitRules';

function ruleTime(cls: ReplicatedClass): Pick<ClassRequirements, 'time_limit_text' | 'time_type'> {
  const rule = cls.timeLimitRule;
  if (!isRuleCurrent(rule, cls)) return { time_limit_text: '', time_type: null };
  if (rule.fixed)
    return { time_limit_text: formatTimeLimitSeconds(rule.fixed), time_type: 'fixed' };
  if (rule.min && rule.max) {
    return {
      time_limit_text: `${formatTimeLimitSeconds(rule.min)}–${formatTimeLimitSeconds(rule.max)}`,
      time_type: 'range',
    };
  }
  return { time_limit_text: '', time_type: null };
}

export function classRequirementsFromClass(
  cls: ReplicatedClass,
  organization: string
): ClassRequirements {
  // The rule's own values (cached at sync) where present; the values copied onto
  // the class when it was created otherwise.
  const rule = isRuleCurrent(cls.timeLimitRule, cls) ? cls.timeLimitRule.display : undefined;
  const classHides = cls.hideCount != null ? String(cls.hideCount) : '';
  const classDistractions = cls.distractionCount != null ? String(cls.distractionCount) : '';
  return {
    organization,
    element: cls.element ?? '',
    level: cls.level ?? '',
    hides: rule ? formatIntRange(rule.hideFixed, rule.hideMin, rule.hideMax) : classHides,
    distractions: rule
      ? formatIntRange(null, rule.distractionMin, rule.distractionMax)
      : classDistractions,
    ...ruleTime(cls),
    area_count: rule?.areaCount ?? cls.areaCount ?? 1,
    hides_known: rule?.hidesKnown ?? cls.hidesKnown ?? true,
    has_blank: rule?.hasBlank ?? false,
    timer_mode: rule?.timerMode ?? cls.timerMode ?? 'single',
    odors: rule?.odors ?? [],
    thirty_second_warning: cls.timeLimitRule?.thirtySecondWarning !== false,
  };
}

/** The class's saved max time(s): "2:00", "Area 1 2:00 · Area 2 2:30", or "Not set". */
export function setMaxTimeText(cls: ReplicatedClass | null, perArea: boolean): string {
  const times = [cls?.timeLimitSeconds, cls?.timeLimitArea2Seconds, cls?.timeLimitArea3Seconds];
  if (!times[0]) return 'Not set';
  const areas = perArea ? Math.min(3, Math.max(1, cls?.areaCount ?? 1)) : 1;
  if (areas === 1) return formatTimeLimitSeconds(times[0]);
  return times
    .slice(0, areas)
    .map((t, i) => `Area ${i + 1} ${formatTimeLimitSeconds(t || times[0])}`)
    .join(' · ');
}
