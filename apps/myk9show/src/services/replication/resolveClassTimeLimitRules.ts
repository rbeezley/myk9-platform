/**
 * The max-time rule a class's judge may choose within, resolved at sync and kept on
 * the local class (like hide counts), so the ringside Set Max Time dialog can check
 * it offline before applying a time the server would refuse (MYK9-1086).
 *
 * `timeLimitRuleRange` is the SAME range ringside_update_class enforces for judges:
 * a fixed rule caps at its fixed time, a judge-set rule spans min..max, otherwise
 * 1..900 seconds.
 */
import { supabase } from '@/services/database/supabaseClient';
import { logger } from '@/utils/logger';
import { getTrialRegistry } from '@/features/registries';

export interface TimeLimitRule {
  fixed?: number | undefined;
  min?: number | undefined;
  max?: number | undefined;
}

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
export function timeLimitRuleRange(rule: TimeLimitRule | undefined): { low: number; high: number } {
  if (rule?.fixed) return { low: 1, high: rule.fixed };
  if (rule?.min && rule?.max) return { low: rule.min, high: rule.max };
  return { low: 1, high: NO_RULE_MAX_SECONDS };
}

/** Max-time rules for these classes, by class id. Failures yield an empty map. */
export async function resolveTimeLimitRulesForClassRows(
  rows: RuleClassRow[]
): Promise<Map<string, TimeLimitRule>> {
  const byClassId = new Map<string, TimeLimitRule>();
  const trialIds = [...new Set(rows.map(row => row.trial_id).filter((id): id is string => !!id))];
  if (trialIds.length === 0) return byClassId;

  const { data: trials, error: trialsError } = await supabase
    .from('trials')
    .select('id, registry_id')
    .in('id', trialIds);
  if (trialsError) {
    logger.warn(
      `[resolveClassTimeLimitRules] Trial lookup failed: ${trialsError.message}`,
      'replication'
    );
    return byClassId;
  }
  const trialById = new Map((trials ?? []).map(trial => [trial.id as string, trial]));
  const registries = [
    ...new Set((trials ?? []).map(trial => trial.registry_id).filter((id): id is string => !!id)),
  ];
  if (registries.length === 0) return byClassId;

  const { data: rules, error: rulesError } = await supabase
    .from('sport_class_rules')
    .select(
      'element, level, max_time_seconds_fixed, max_time_seconds_min, max_time_seconds_max, sport_templates!inner(organization)'
    )
    .in('sport_templates.organization', registries);
  if (rulesError) {
    logger.warn(
      `[resolveClassTimeLimitRules] Rule lookup failed: ${rulesError.message}`,
      'replication'
    );
    return byClassId;
  }

  // Aggregate over section rows the same way the server does: max(fixed),
  // min(min), max(max).
  const ruleByKey = new Map<string, TimeLimitRule>();
  for (const rule of (rules ?? []) as unknown as RuleRow[]) {
    const organization = organizationOf(rule);
    if (!organization) continue;
    const k = key(organization, rule.element, rule.level);
    const prev = ruleByKey.get(k) ?? {};
    ruleByKey.set(k, {
      fixed: maxOf(prev.fixed, rule.max_time_seconds_fixed),
      min: minOf(prev.min, rule.max_time_seconds_min),
      max: maxOf(prev.max, rule.max_time_seconds_max),
    });
  }

  for (const row of rows) {
    if (!row.trial_id) continue;
    const registry = getTrialRegistry(trialById.get(row.trial_id)).id;
    const rule = registry ? ruleByKey.get(key(registry, row.element, row.level)) : undefined;
    if (rule) byClassId.set(row.id, rule);
  }
  return byClassId;
}

function maxOf(a: number | undefined, b: number | null): number | undefined {
  if (b === null || b === undefined) return a;
  return a === undefined ? b : Math.max(a, b);
}

function minOf(a: number | undefined, b: number | null): number | undefined {
  if (b === null || b === undefined) return a;
  return a === undefined ? b : Math.min(a, b);
}
