import { supabase } from '@/services/database/supabaseClient';
import { logger } from '@/utils/logger';

interface HideCountClassRow {
  id: string;
  trial_id: string | null;
  element?: string | null;
  level?: string | null;
  section?: string | null;
}

interface HideCountTrialRow {
  id: string;
  show_id: string | null;
  registry_id: string | null;
}

interface PublicHideCountRuleRow {
  element: string;
  level: string | null;
  section: string | null;
  hide_count_fixed: number | null;
  hides_known: boolean | null;
  sport_templates: { organization: string } | Array<{ organization: string }> | null;
}

const ruleKey = (
  registryId: string,
  element: string | null | undefined,
  level: string | null | undefined,
  section: string | null | undefined
): string => JSON.stringify([registryId, element ?? null, level ?? null, section ?? null]);

function ruleOrganization(rule: PublicHideCountRuleRow): string | null {
  if (Array.isArray(rule.sport_templates)) {
    return rule.sport_templates[0]?.organization ?? null;
  }
  return rule.sport_templates?.organization ?? null;
}

/**
 * Hide-count enrichment for class rows that already passed normal visibility.
 *
 * Direct `classes.num_hides` reads remain denied to clients because the same
 * column stores both public fixed totals and protected judge-set totals. Safe
 * fixed values are reconstructed from public registry rules only when
 * `hides_known = true` and `hide_count_fixed` is non-null. Protected actual
 * values come only from `get_show_class_hide_counts(show_id)`, whose existing
 * show-role and judge-assignment checks return nothing to exhibitors.
 *
 * The official RPC is applied last so an authorized ringside device receives
 * the persisted actual value and can retain it offline. Public-rule and RPC
 * lookups are independently best-effort: failure of either enrichment must not
 * break class replication or discard the other safe result.
 */
export async function resolveHideCountsForClassRows(
  rows: ReadonlyArray<HideCountClassRow>
): Promise<Map<string, number>> {
  const byClassId = new Map<string, number>();

  const trialIds = [...new Set(rows.map(row => row.trial_id).filter((id): id is string => !!id))];
  if (trialIds.length === 0) return byClassId;

  const { data: trialData, error: trialsError } = await supabase
    .from('trials')
    .select('id, show_id, registry_id')
    .in('id', trialIds);

  if (trialsError) {
    logger.warn(
      `[resolveClassHideCounts] Trial lookup failed; hide counts unavailable this sync: ${trialsError.message}`,
      'replication'
    );
    return byClassId;
  }

  const trials = (trialData ?? []) as HideCountTrialRow[];
  const trialById = new Map(trials.map(trial => [trial.id, trial]));
  const registryIds = [
    ...new Set(trials.map(trial => trial.registry_id).filter((id): id is string => !!id)),
  ];

  if (registryIds.length > 0) {
    const { data: ruleData, error: rulesError } = await supabase
      .from('sport_class_rules')
      .select(
        'element, level, section, hide_count_fixed, hides_known, sport_templates!inner(organization)'
      )
      .in('sport_templates.organization', registryIds)
      .eq('hides_known', true)
      .not('hide_count_fixed', 'is', null);

    if (rulesError) {
      logger.warn(
        `[resolveClassHideCounts] Public hide rules unavailable this sync: ${rulesError.message}`,
        'replication'
      );
    } else {
      const fixedCountByRule = new Map<string, number>();
      for (const rule of (ruleData ?? []) as unknown as PublicHideCountRuleRow[]) {
        const organization = ruleOrganization(rule);
        if (
          organization &&
          rule.hides_known === true &&
          typeof rule.hide_count_fixed === 'number'
        ) {
          fixedCountByRule.set(
            ruleKey(organization, rule.element, rule.level, rule.section),
            rule.hide_count_fixed
          );
        }
      }

      for (const row of rows) {
        if (!row.trial_id) continue;
        const registryId = trialById.get(row.trial_id)?.registry_id;
        if (!registryId) continue;
        const fixedCount = fixedCountByRule.get(
          ruleKey(registryId, row.element, row.level, row.section)
        );
        if (fixedCount !== undefined) {
          byClassId.set(row.id, fixedCount);
        }
      }
    }
  }

  const showIds = [
    ...new Set(trials.map(trial => trial.show_id).filter((id): id is string => !!id)),
  ];

  await Promise.all(
    showIds.map(async showId => {
      const { data, error } = await supabase.rpc('get_show_class_hide_counts', {
        p_show_id: showId,
      });

      if (error) {
        logger.warn(
          `[resolveClassHideCounts] Official hide counts unavailable for show ${showId}: ${error.message}`,
          'replication'
        );
        return;
      }

      for (const row of data ?? []) {
        if (row.class_id && typeof row.num_hides === 'number') {
          byClassId.set(row.class_id, row.num_hides);
        }
      }
    })
  );

  return byClassId;
}
