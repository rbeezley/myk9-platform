/**
 * The max-time rule a class's judge may choose within, resolved at sync and kept on
 * the local class (like hide counts), so the ringside Set Max Time dialog can check
 * it OFFLINE before applying a time the server would refuse (MYK9-1086). The judge
 * decides the time while setting up the search, often with no signal.
 *
 * `timeLimitRuleRange` is the SAME range ringside_update_class enforces for judges:
 * a fixed rule caps at its fixed time, a judge-set rule spans min..max, otherwise
 * 1..900 seconds.
 */
import { supabase } from '@/services/database/supabaseClient';
import { logger } from '@/utils/logger';
import { getTrialRegistry } from '@/features/registries';

/**
 * A resolved rule. `forElement`/`forLevel` record which class configuration it was
 * resolved for, so a consumer can tell a stale rule (the class's element or level
 * changed since) from a current one. No fixed/min/max means "resolved: no rule".
 */
export interface TimeLimitRule {
  fixed?: number | undefined;
  min?: number | undefined;
  max?: number | undefined;
  /**
   * The rest of the rule, for the ringside Requirements dialog offline
   * (MYK9-1100). Absent on a rule cached before it was added.
   */
  display?: RuleDisplay | undefined;
  forElement: string | null;
  forLevel: string | null;
}

/** The rule's requirement values, as sport_class_rules holds them. */
export interface RuleDisplay {
  hideFixed: number | null;
  hideMin: number | null;
  hideMax: number | null;
  hidesKnown: boolean;
  distractionMin: number | null;
  distractionMax: number | null;
  areaCount: number;
  hasBlank: boolean;
  timerMode: string;
  odors: string[];
}

type RuleLimits = Pick<TimeLimitRule, 'fixed' | 'min' | 'max' | 'display'>;

interface RuleClassRow {
  id: string;
  trial_id: string | null;
  element?: string | null;
  level?: string | null;
}

interface RuleRow {
  element: string;
  level: string | null;
  max_time_seconds_fixed: number | null;
  max_time_seconds_min: number | null;
  max_time_seconds_max: number | null;
  hide_count_fixed?: number | null;
  hide_count_min?: number | null;
  hide_count_max?: number | null;
  hides_known?: boolean | null;
  distraction_count_min?: number | null;
  distraction_count_max?: number | null;
  area_count?: number | null;
  has_blank?: boolean | null;
  timer_mode?: string | null;
  odors?: string[] | null;
  sport_templates: { organization: string } | Array<{ organization: string }> | null;
}

const NO_RULE_MAX_SECONDS = 900;

const key = (registry: string, element?: string | null, level?: string | null) =>
  JSON.stringify([registry, element ?? null, level ?? null]);

function organizationOf(rule: RuleRow): string | null {
  const st = rule.sport_templates;
  return (Array.isArray(st) ? st[0]?.organization : st?.organization) ?? null;
}

/** The range a judge may set, mirroring the server's check. */
export function timeLimitRuleRange(rule: RuleLimits | undefined): { low: number; high: number } {
  if (rule?.fixed) return { low: 1, high: rule.fixed };
  if (rule?.min && rule?.max) return { low: rule.min, high: rule.max };
  return { low: 1, high: NO_RULE_MAX_SECONDS };
}

/** True when `rule` was resolved for the class's CURRENT element and level. */
export function isRuleCurrent(
  rule: TimeLimitRule | undefined,
  cls: { element?: string | undefined; level?: string | undefined }
): rule is TimeLimitRule {
  return (
    !!rule && rule.forElement === (cls.element ?? null) && rule.forLevel === (cls.level ?? null)
  );
}

/**
 * Max-time rules for these classes, by class id: every class with a trial gets an
 * entry, with no limits when its registry has no rule for it. `null` means the
 * lookup FAILED -- never read that as "no rule".
 */
export async function resolveTimeLimitRulesForClassRows(
  rows: RuleClassRow[]
): Promise<Map<string, TimeLimitRule> | null> {
  const withTrial = rows.filter(row => !!row.trial_id);
  const trialIds = [...new Set(withTrial.map(row => row.trial_id as string))];
  if (trialIds.length === 0) return new Map();

  const { data: trials, error: trialsError } = await supabase
    .from('trials')
    .select('id, registry_id')
    .in('id', trialIds);
  if (trialsError) {
    logger.warn(
      `[resolveClassTimeLimitRules] Trial lookup failed: ${trialsError.message}`,
      'replication'
    );
    return null;
  }
  const trialById = new Map((trials ?? []).map(trial => [trial.id as string, trial]));
  const registries = [
    ...new Set(withTrial.map(row => getTrialRegistry(trialById.get(row.trial_id as string)).id)),
  ];

  const { data: rules, error: rulesError } = await supabase
    .from('sport_class_rules')
    .select(
      'element, level, max_time_seconds_fixed, max_time_seconds_min, max_time_seconds_max, hide_count_fixed, hide_count_min, hide_count_max, hides_known, distraction_count_min, distraction_count_max, area_count, has_blank, timer_mode, odors, sport_templates!inner(organization)'
    )
    .in('sport_templates.organization', registries);
  if (rulesError) {
    logger.warn(
      `[resolveClassTimeLimitRules] Rule lookup failed: ${rulesError.message}`,
      'replication'
    );
    return null;
  }

  // Aggregate over section rows the same way the server does: max(fixed),
  // min(min), max(max).
  const limitsByKey = new Map<string, RuleLimits>();
  for (const rule of (rules ?? []) as unknown as RuleRow[]) {
    const organization = organizationOf(rule);
    if (!organization) continue;
    const k = key(organization, rule.element, rule.level);
    const prev = limitsByKey.get(k) ?? {};
    limitsByKey.set(k, {
      fixed: maxOf(prev.fixed, rule.max_time_seconds_fixed),
      min: minOf(prev.min, rule.max_time_seconds_min),
      max: maxOf(prev.max, rule.max_time_seconds_max),
      // Requirement values come from the first section row (A and B share them).
      display: prev.display ?? ruleDisplay(rule),
    });
  }

  const byClassId = new Map<string, TimeLimitRule>();
  for (const row of withTrial) {
    const registry = getTrialRegistry(trialById.get(row.trial_id as string)).id;
    byClassId.set(row.id, {
      ...limitsByKey.get(key(registry, row.element, row.level)),
      forElement: row.element ?? null,
      forLevel: row.level ?? null,
    });
  }
  return byClassId;
}

function ruleDisplay(rule: RuleRow): RuleDisplay {
  return {
    hideFixed: rule.hide_count_fixed ?? null,
    hideMin: rule.hide_count_min ?? null,
    hideMax: rule.hide_count_max ?? null,
    hidesKnown: rule.hides_known ?? true,
    distractionMin: rule.distraction_count_min ?? null,
    distractionMax: rule.distraction_count_max ?? null,
    areaCount: rule.area_count ?? 1,
    hasBlank: rule.has_blank ?? false,
    timerMode: rule.timer_mode ?? 'single',
    odors: rule.odors ?? [],
  };
}

function maxOf(a: number | undefined, b: number | null): number | undefined {
  if (b === null || b === undefined) return a;
  return a === undefined ? b : Math.max(a, b);
}

function minOf(a: number | undefined, b: number | null): number | undefined {
  if (b === null || b === undefined) return a;
  return a === undefined ? b : Math.min(a, b);
}
