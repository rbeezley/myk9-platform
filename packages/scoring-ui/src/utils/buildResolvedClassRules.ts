/**
 * Builds a ResolvedClassRules object from a class record.
 *
 * Pure function — no DB calls, no store access. Accepts both
 * camelCase and snake_case field names so it works with both
 * myK9Show and myK9Q class records without adapters.
 *
 * Missing fields get safe defaults so classes created before the
 * rule-column migration still render correctly.
 */
import type { ClassRuleFields, ResolvedClassRules } from '../types/resolvedClassRules';

const DEFAULT_MAX_TIME_SECONDS = 180; // 3 minutes

export function buildResolvedClassRules(classRecord: ClassRuleFields): ResolvedClassRules {
  const areaCount = classRecord.areaCount ?? classRecord.area_count ?? classRecord.num_areas ?? 1;

  const maxTimeSeconds =
    classRecord.timeLimitSeconds ?? classRecord.time_limit_seconds ?? DEFAULT_MAX_TIME_SECONDS;

  const rawTimerMode = classRecord.timerMode ?? classRecord.timer_mode ?? 'single';
  const timerMode: 'single' | 'dual' = rawTimerMode === 'dual' ? 'dual' : 'single';

  const hideCount = classRecord.hideCount ?? classRecord.hide_count ?? classRecord.num_hides ?? null;

  const hidesKnown = classRecord.hidesKnown ?? classRecord.hides_known ?? true;

  const distractionCount = classRecord.distractionCount ?? classRecord.distraction_count ?? 0;

  return {
    areaCount,
    timerMode,
    maxTimeSeconds,
    hideCount,
    hidesKnown,
    distractionCount,
  };
}
