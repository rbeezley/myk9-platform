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

// Row shape returned by the get_show_officials SECURITY DEFINER RPC.
// SA-006: user_roles is no longer directly SELECT-able cross-user, so officials
// are read through this RPC (see migration 20260703180000).
interface ShowOfficialRow {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: string;
}

async function fetchShowOfficials(showId: string): Promise<ShowOfficials> {
  const { data, error } = await supabase.rpc('get_show_officials', { p_show_id: showId });

  if (error) throw error;

  const result: ShowOfficials = { secretaries: [], chairmen: [], stewards: [] };

  for (const row of (data as ShowOfficialRow[] | null) || []) {
    if (!row.user_id) continue;
    const role = row.role;
    const official: ShowOfficial = {
      personId: row.user_id,
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      email: row.email || null,
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
