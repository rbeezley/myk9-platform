// Service layer for sport_templates, sport_class_rules, and sport_titles tables
import { supabase } from '@/lib/supabase';
import type {
  SportTemplateRow,
  SportClassRuleRow,
  SportTitleRow,
} from '@/types/sport-template-types';

// ---------------------------------------------------------------------------
// Sport Templates
// ---------------------------------------------------------------------------

export async function fetchAllSportTemplates(): Promise<SportTemplateRow[]> {
  const { data, error } = await supabase
    .from('sport_templates')
    .select('*')
    .eq('is_active', true)
    .order('organization');
  if (error) throw error;
  return data as SportTemplateRow[];
}

export async function fetchSportTemplateByCode(
  sportCode: string
): Promise<SportTemplateRow | null> {
  const { data, error } = await supabase
    .from('sport_templates')
    .select('*')
    .eq('sport_code', sportCode)
    .single();
  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
  return (data as SportTemplateRow) ?? null;
}

// ---------------------------------------------------------------------------
// Sport Class Rules
// ---------------------------------------------------------------------------

// Sport_class_rules are static reference data — cache them for the session so repeated
// saves and pre-warm calls don't each pay a Supabase round-trip.
const _classRulesCache = new Map<string, SportClassRuleRow[]>();

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isDbSportTemplateId(templateId: string): boolean {
  return UUID_PATTERN.test(templateId);
}

export async function fetchClassRulesForTemplate(templateId: string): Promise<SportClassRuleRow[]> {
  if (_classRulesCache.has(templateId)) return _classRulesCache.get(templateId)!;
  if (!isDbSportTemplateId(templateId)) {
    _classRulesCache.set(templateId, []);
    return [];
  }

  const { data, error } = await supabase
    .from('sport_class_rules')
    .select('*')
    .eq('sport_template_id', templateId)
    .order('display_order');
  if (error) throw error;
  const rules = data as SportClassRuleRow[];
  _classRulesCache.set(templateId, rules);
  return rules;
}

/**
 * Kick off background rule fetches for a set of template IDs.
 * Call this when class templates are loaded in the wizard so rules are
 * cached before the user hits "Create and Publish".
 */
export function prewarmClassRulesCache(templateIds: string[]): void {
  for (const id of templateIds) {
    if (isDbSportTemplateId(id) && !_classRulesCache.has(id)) {
      fetchClassRulesForTemplate(id).catch(() => {
        // non-critical — save path handles fetch errors gracefully
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Sport Titles
// ---------------------------------------------------------------------------

export async function fetchTitlesForTemplate(templateId: string): Promise<SportTitleRow[]> {
  const { data, error } = await supabase
    .from('sport_titles')
    .select('*')
    .eq('sport_template_id', templateId)
    .order('sort_order');
  if (error) throw error;
  return data as SportTitleRow[];
}

export async function fetchAllSportTitles(): Promise<SportTitleRow[]> {
  const { data, error } = await supabase.from('sport_titles').select('*').order('sort_order');
  if (error) throw error;
  return data as SportTitleRow[];
}

// ---------------------------------------------------------------------------
// Combined: template + rules (single round-trip via embed)
// ---------------------------------------------------------------------------

export async function fetchSportTemplateWithRules(sportCode: string) {
  const { data, error } = await supabase
    .from('sport_templates')
    .select('*, sport_class_rules(*)')
    .eq('sport_code', sportCode)
    .single();
  if (error) throw error;
  return data as SportTemplateRow & { sport_class_rules: SportClassRuleRow[] };
}

export async function fetchAllSportTemplatesWithRules() {
  const { data, error } = await supabase
    .from('sport_templates')
    .select('*, sport_class_rules(*)')
    .eq('is_active', true)
    .order('organization');
  if (error) throw error;
  return data as (SportTemplateRow & { sport_class_rules: SportClassRuleRow[] })[];
}
