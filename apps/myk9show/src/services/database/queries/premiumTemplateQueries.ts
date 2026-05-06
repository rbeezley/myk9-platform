/**
 * Premium Template Database Queries
 *
 * Database operations for club premium templates and premium generation history.
 * These tables (club_premium_templates, premium_generations) are not yet in the
 * generated Supabase types, so we use untypedFrom() for .from() calls.
 */

import type {
  ClubPremiumTemplate,
  PremiumGeneration,
  PremiumStyle,
} from '../../../types/premium-types';
import { untypedFrom } from './search-query-helpers';

// ── table accessors ───────────────────────────────────────────────────────────

const templatesTable = () => untypedFrom('club_premium_templates');
const generationsTable = () => untypedFrom('premium_generations');

// ── helpers ───────────────────────────────────────────────────────────────────

function rowToTemplate(row: Record<string, unknown>): ClubPremiumTemplate {
  return {
    id: row.id as string,
    clubId: row.club_id as string,
    name: row.name as string,
    trialType: row.trial_type as string | null,
    isDefault: row.is_default as boolean,
    style: (row.style as PremiumStyle) ?? 'monogram',
    vetClinicName: row.vet_clinic_name as string | null,
    vetClinicAddress: row.vet_clinic_address as string | null,
    vetClinicPhone: row.vet_clinic_phone as string | null,
    accommodations: (row.accommodations as ClubPremiumTemplate['accommodations']) ?? [],
    hospitalityNotes: row.hospitality_notes as string | null,
    awardsDescription: row.awards_description as string | null,
    additionalNotes: row.additional_notes as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function templateToRow(t: Partial<ClubPremiumTemplate>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (t.clubId !== undefined) row.club_id = t.clubId;
  if (t.name !== undefined) row.name = t.name;
  if (t.trialType !== undefined) row.trial_type = t.trialType;
  if (t.isDefault !== undefined) row.is_default = t.isDefault;
  if (t.style !== undefined) row.style = t.style;
  if (t.vetClinicName !== undefined) row.vet_clinic_name = t.vetClinicName;
  if (t.vetClinicAddress !== undefined) row.vet_clinic_address = t.vetClinicAddress;
  if (t.vetClinicPhone !== undefined) row.vet_clinic_phone = t.vetClinicPhone;
  if (t.accommodations !== undefined) row.accommodations = t.accommodations;
  if (t.hospitalityNotes !== undefined) row.hospitality_notes = t.hospitalityNotes;
  if (t.awardsDescription !== undefined) row.awards_description = t.awardsDescription;
  if (t.additionalNotes !== undefined) row.additional_notes = t.additionalNotes;
  return row;
}

// ── queries ───────────────────────────────────────────────────────────────────

export async function fetchClubPremiumTemplates(clubId: string): Promise<ClubPremiumTemplate[]> {
  const { data, error } = await templatesTable()
    .select('*')
    .eq('club_id', clubId)
    .order('is_default', { ascending: false })
    .order('name');
  if (error) throw error;
  return (data as Record<string, unknown>[]).map(rowToTemplate);
}

export async function createClubPremiumTemplate(
  input: Omit<ClubPremiumTemplate, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ClubPremiumTemplate> {
  const { data, error } = await templatesTable().insert(templateToRow(input)).select().single();
  if (error) throw error;
  return rowToTemplate(data as Record<string, unknown>);
}

export async function updateClubPremiumTemplate(
  id: string,
  updates: Partial<Omit<ClubPremiumTemplate, 'id' | 'clubId' | 'createdAt' | 'updatedAt'>>
): Promise<ClubPremiumTemplate> {
  const { data, error } = await templatesTable()
    .update(templateToRow(updates))
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return rowToTemplate(data as Record<string, unknown>);
}

export async function deleteClubPremiumTemplate(id: string): Promise<void> {
  const { error } = await templatesTable().delete().eq('id', id);
  if (error) throw error;
}

export async function fetchRecentPremiumGenerations(
  clubId: string,
  limit = 5
): Promise<Pick<PremiumGeneration, 'fieldOverrides'>[]> {
  const { data, error } = await generationsTable()
    .select('field_overrides')
    .eq('club_id', clubId)
    .order('generated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as Record<string, unknown>[]).map(row => ({
    fieldOverrides: (row.field_overrides ?? {}) as PremiumGeneration['fieldOverrides'],
  }));
}

export async function insertPremiumGeneration(
  gen: Omit<PremiumGeneration, 'id' | 'generatedAt'>
): Promise<void> {
  const { error } = await generationsTable().insert({
    show_id: gen.showId,
    club_id: gen.clubId,
    template_id: gen.templateId,
    org: gen.org,
    field_overrides: gen.fieldOverrides,
    narrative_edits: gen.narrativeEdits,
  });
  if (error) throw error;
}
