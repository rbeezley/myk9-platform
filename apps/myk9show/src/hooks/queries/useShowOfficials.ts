import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';

export interface ShowOfficial {
  personId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  role: 'secretary' | 'chairman' | 'steward';
}

export interface ShowOfficials {
  secretaries: ShowOfficial[];
  chairmen: ShowOfficial[];
  stewards: ShowOfficial[];
}

const OFFICIAL_ROLES = ['secretary', 'chairman', 'steward'];

// Cached role name → id map (roles table is static)
let officialRoleIds: Map<string, string> | null = null;

async function getOfficialRoleIds(): Promise<Map<string, string>> {
  if (officialRoleIds) return officialRoleIds;
  const { data, error } = await supabase
    .from('roles')
    .select('id, name')
    .in('name', OFFICIAL_ROLES);
  if (error) throw error;
  officialRoleIds = new Map((data || []).map(r => [r.id, r.name]));
  return officialRoleIds;
}

async function fetchShowOfficials(showId: string): Promise<ShowOfficials> {
  const roleMap = await getOfficialRoleIds();
  const roleIds = Array.from(roleMap.keys());

  const { data, error } = await supabase
    .from('user_roles')
    .select(
      `
      role_id,
      people!user_roles_user_id_fkey(id, first_name, last_name, email)
    `
    )
    .eq('show_id', showId)
    .eq('is_active', true)
    .in('role_id', roleIds);

  if (error) throw error;

  const result: ShowOfficials = { secretaries: [], chairmen: [], stewards: [] };

  for (const row of data || []) {
    const role = roleMap.get(row.role_id as string);
    if (!role) continue;
    const person = row.people as Record<string, unknown>;
    if (!person) continue;
    const official: ShowOfficial = {
      personId: person.id as string,
      firstName: (person.first_name as string) || '',
      lastName: (person.last_name as string) || '',
      email: (person.email as string) || null,
      role: role as ShowOfficial['role'],
    };

    if (role === 'secretary') result.secretaries.push(official);
    else if (role === 'chairman') result.chairmen.push(official);
    else if (role === 'steward') result.stewards.push(official);
  }

  return result;
}

export function useShowOfficials(showId: string | undefined): UseQueryResult<ShowOfficials> {
  return useQuery({
    queryKey: queryKeys.showOfficials(showId || ''),
    queryFn: () => fetchShowOfficials(showId!),
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });
}

/**
 * Non-hook version for use outside React (export, reports).
 */
export async function getShowOfficials(showId: string): Promise<ShowOfficials> {
  return fetchShowOfficials(showId);
}
