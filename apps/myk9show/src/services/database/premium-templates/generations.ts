// Read/write operations for premium_generations — history of generated show premiums.

import type { PremiumGeneration } from '../../../types/premium-types';
import { untypedFrom } from '../_shared/untyped-from';

const generationsTable = () => untypedFrom('premium_generations');

export async function getRecentPremiumGenerations(
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
