// MYK9-1235: per-organization club numbers (club_registry_numbers). Online-only
// reads and writes: the club page and the Edit Club panel are admin surfaces,
// and the table is not replicated (see the migration header).
import { supabase } from '../supabaseClient';
import {
  CLUB_REGISTRY_ORGS,
  normalizeClubRegistryNumbers,
  type ClubRegistryNumbers,
  type ClubRegistryOrg,
} from '@/utils/clubRegistryNumbers';

export async function getClubRegistryNumbers(clubId: string): Promise<ClubRegistryNumbers> {
  const { data, error } = await supabase
    .from('club_registry_numbers')
    .select('organization, number')
    .eq('club_id', clubId);

  if (error) throw error;

  const result: ClubRegistryNumbers = {};
  for (const row of data ?? []) {
    if ((CLUB_REGISTRY_ORGS as readonly string[]).includes(row.organization)) {
      result[row.organization as ClubRegistryOrg] = row.number;
    }
  }
  return result;
}

/**
 * Makes the club's stored numbers equal `numbers`: one upsert for the
 * organizations given, one delete for the rest (a cleared field removes that
 * organization's row).
 */
export async function saveClubRegistryNumbers(
  clubId: string,
  numbers: Partial<Record<ClubRegistryOrg, string | null | undefined>>
): Promise<void> {
  const normalized = normalizeClubRegistryNumbers(numbers);
  const rows = CLUB_REGISTRY_ORGS.filter(org => normalized[org]).map(org => ({
    club_id: clubId,
    organization: org,
    number: normalized[org] as string,
  }));
  const removed = CLUB_REGISTRY_ORGS.filter(org => !normalized[org]);

  if (rows.length > 0) {
    const { error } = await supabase
      .from('club_registry_numbers')
      .upsert(rows, { onConflict: 'club_id,organization' });
    if (error) throw error;
  }

  if (removed.length > 0) {
    const { error } = await supabase
      .from('club_registry_numbers')
      .delete()
      .eq('club_id', clubId)
      .in('organization', removed);
    if (error) throw error;
  }
}
