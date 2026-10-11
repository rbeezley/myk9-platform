/**
 * Class requirements built from the class itself, for ringside with no signal
 * (MYK9-1100). Rule values are copied onto the class when it is created (hides,
 * distractions, areas, timer mode) and the max-time rule is cached on it at sync,
 * so the Requirements dialog can show them offline. Online, the full rule from
 * sport_class_rules (odors, blank area) replaces this.
 */
import { formatTimeLimitSeconds } from '@myk9/core';
import type { ClassRequirements } from '@/hooks/queries/useClassRequirements';
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
  return {
    organization,
    element: cls.element ?? '',
    level: cls.level ?? '',
    hides: cls.hideCount != null ? String(cls.hideCount) : '',
    distractions: cls.distractionCount != null ? String(cls.distractionCount) : '',
    ...ruleTime(cls),
    area_count: cls.areaCount ?? 1,
    hides_known: cls.hidesKnown ?? true,
    has_blank: false,
    timer_mode: cls.timerMode ?? 'single',
    odors: [],
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
