// CRUD operations for club_premium_templates — reusable show-premium templates per club.

import type { ClubPremiumTemplate, PremiumStyle } from '../../../types/premium-types';
import { untypedFrom } from '../_shared/untyped-from';

const templatesTable = () => untypedFrom('club_premium_templates');

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
    coverImageUrl: (row.cover_image_url as string | null) ?? null,
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
  if (t.coverImageUrl !== undefined) row.cover_image_url = t.coverImageUrl;
  if (t.hospitalityNotes !== undefined) row.hospitality_notes = t.hospitalityNotes;
  if (t.awardsDescription !== undefined) row.awards_description = t.awardsDescription;
  if (t.additionalNotes !== undefined) row.additional_notes = t.additionalNotes;
  return row;
}

export async function getClubPremiumTemplates(clubId: string): Promise<ClubPremiumTemplate[]> {
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
