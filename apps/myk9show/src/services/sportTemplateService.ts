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

export async function fetchSportTemplateByCode(sportCode: string): Promise<SportTemplateRow | null> {
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

export async function fetchClassRulesForTemplate(templateId: string): Promise<SportClassRuleRow[]> {
  const { data, error } = await supabase
    .from('sport_class_rules')
    .select('*')
    .eq('sport_template_id', templateId)
    .order('display_order');
  if (error) throw error;
  return data as SportClassRuleRow[];
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
