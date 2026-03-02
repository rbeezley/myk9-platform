// React Query hooks for sport_templates (DB-driven template system)
import { useQuery } from '@tanstack/react-query';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import {
  fetchAllSportTemplates,
  fetchAllSportTemplatesWithRules,
  fetchSportTemplateWithRules,
  fetchClassRulesForTemplate,
  fetchTitlesForTemplate,
  fetchAllSportTitles,
} from '@/services/sportTemplateService';
import { mapSportTemplateToClassTemplate } from '@/types/sport-template-types';
import type { ClassTemplate } from '@/types/template.types';

/** All active sport templates (metadata only, no class rules). */
export function useSportTemplatesQuery() {
  return useQuery({
    queryKey: queryKeys.sportTemplates,
    queryFn: fetchAllSportTemplates,
    ...cacheStrategies.static,
  });
}

/** Single sport template + class rules, mapped to ClassTemplate. */
export function useSportTemplateAsClassTemplate(sportCode: string, enabled = true) {
  return useQuery<ClassTemplate>({
    queryKey: queryKeys.sportTemplate(sportCode),
    queryFn: async () => {
      const row = await fetchSportTemplateWithRules(sportCode);
      return mapSportTemplateToClassTemplate(row, row.sport_class_rules);
    },
    enabled: !!sportCode && enabled,
    ...cacheStrategies.static,
  });
}

/** All active templates + rules, each mapped to ClassTemplate. */
export function useAllSportTemplatesAsClassTemplates() {
  return useQuery<ClassTemplate[]>({
    queryKey: [...queryKeys.sportTemplates, 'as-class-templates'],
    queryFn: async () => {
      const rows = await fetchAllSportTemplatesWithRules();
      return rows.map(row => mapSportTemplateToClassTemplate(row, row.sport_class_rules));
    },
    ...cacheStrategies.static,
  });
}

/** Class rules for a specific template ID. */
export function useSportClassRulesQuery(templateId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.sportTemplateRules(templateId),
    queryFn: () => fetchClassRulesForTemplate(templateId),
    enabled: !!templateId && enabled,
    ...cacheStrategies.static,
  });
}

/** Title definitions for a specific template ID. */
export function useSportTitlesQuery(templateId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.sportTemplateTitles(templateId),
    queryFn: () => fetchTitlesForTemplate(templateId),
    enabled: !!templateId && enabled,
    ...cacheStrategies.static,
  });
}

/** All sport title definitions across all templates (static cache). */
export function useAllSportTitlesQuery() {
  return useQuery({
    queryKey: [...queryKeys.sportTemplates, 'all-titles'],
    queryFn: fetchAllSportTitles,
    ...cacheStrategies.static,
  });
}
