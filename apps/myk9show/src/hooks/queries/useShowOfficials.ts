import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';

export interface ShowOfficial {
  personId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  /** MYK9-2065: typed for the premium; null for a steward and until the club enters one. */
  mailingAddress?: string | null;
  /** MYK9-2204: the current phone, returned only to a caller who can manage the show. */
  phone?: string | null;
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
  premium_mailing_address?: string | null;
  phone?: string | null;
}

/** Thrown by `fetchShowOfficials(..., { requirePhone: true })` when the RPC predates the phone column. */
export class ShowOfficialsPhoneMissingError extends Error {
  override readonly name = 'ShowOfficialsPhoneMissingError';
}

export async function fetchShowOfficials(
  showId: string,
  options: { requirePhone?: boolean } = {}
): Promise<ShowOfficials> {
  const { data, error } = await supabase.rpc('get_show_officials', { p_show_id: showId });

  if (error) throw error;

  const result: ShowOfficials = { secretaries: [], chairmen: [], stewards: [] };

  for (const row of (data as ShowOfficialRow[] | null) || []) {
    if (!row.user_id) continue;
    // MYK9-2204: a row with no `phone` key came from an RPC that predates the column (the app
    // deployed before the migration); an explicit null is a cleared or hidden phone.
    if (options.requirePhone && !('phone' in row)) {
      throw new ShowOfficialsPhoneMissingError('get_show_officials returned no phone column');
    }
    const role = row.role;
    const official: ShowOfficial = {
      personId: row.user_id,
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      email: row.email || null,
      mailingAddress: row.premium_mailing_address?.trim() || null,
      phone: row.phone?.trim() || null,
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
