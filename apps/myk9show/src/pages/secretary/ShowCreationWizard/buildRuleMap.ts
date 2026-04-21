import { fetchClassRulesForTemplate } from '@/services/sportTemplateService';
import { logger } from '@/services/LoggingService';
import type { SportClassRuleRow } from '@/types/sport-template-types';

/**
 * Pre-fetch sport_class_rules for the given templates and return a lookup
 * map keyed by `${templateId}|${element}|${level}`. Used by the wizard to
 * bake scoring-rule fields into class rows at creation time so scoring works
 * fully offline.
 *
 * Per-template failures are logged and skipped — a missing rule falls back
 * to null in the class row, which is the same behavior as an unknown key.
 */
export async function buildRuleMap(
  templateIds: Iterable<string>
): Promise<Map<string, SportClassRuleRow>> {
  const ruleMap = new Map<string, SportClassRuleRow>();
  const unique = new Set<string>();
  for (const id of templateIds) if (id) unique.add(id);
  if (unique.size === 0) return ruleMap;

  await Promise.all(
    [...unique].map(async templateId => {
      try {
        const rules = await fetchClassRulesForTemplate(templateId);
        for (const rule of rules) {
          const key = `${templateId}|${rule.element}|${rule.level ?? ''}`;
          ruleMap.set(key, rule);
        }
      } catch (err) {
        logger.warn('Failed to fetch rules for template', 'wizard', {
          templateId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })
  );

  return ruleMap;
}
