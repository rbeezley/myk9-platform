/**
 * Resolves a show's effective withdrawal policy = the show's override columns,
 * falling back to its club's defaults (one joined read via shows.club_id).
 *
 * Returns null when neither level declares a policy. Errors (e.g. the migration
 * not yet deployed, so the columns don't exist) propagate as isError — callers
 * render nothing in that case rather than crash.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  getEffectiveWithdrawalPolicy,
  type WithdrawalPolicy,
  type ClubWithdrawalFields,
  type ShowWithdrawalFields,
} from './withdrawalPolicy';

const SELECT = `
  withdrawal_cutoff_date,
  withdrawal_retention_type,
  withdrawal_retention_value,
  withdrawal_policy_notes,
  clubs (
    default_withdrawal_cutoff_date,
    default_withdrawal_retention_type,
    default_withdrawal_retention_value,
    default_withdrawal_policy_notes
  )
`;

export function useEffectiveWithdrawalPolicy(showId: string | null | undefined) {
  return useQuery<WithdrawalPolicy | null>({
    queryKey: ['effective-withdrawal-policy', showId],
    enabled: !!showId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shows')
        .select(SELECT)
        .eq('id', showId as string)
        .single();
      if (error) throw error;

      const row = data as unknown as Record<string, unknown>;
      // Embedded to-one can come back as an object or a single-element array
      // depending on PostgREST relationship detection — normalize both.
      const rawClub = row.clubs;
      const club = (Array.isArray(rawClub) ? rawClub[0] : rawClub) as ClubWithdrawalFields | null;

      return getEffectiveWithdrawalPolicy(row as ShowWithdrawalFields, club ?? null);
    },
  });
}
