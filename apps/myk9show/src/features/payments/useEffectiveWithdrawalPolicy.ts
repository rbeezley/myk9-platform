/**
 * Resolves a show's effective withdrawal terms in one joined read via shows.club_id:
 *  - `policy`: the structured fields (show override per field, else the club default), the
 *    ONLY input to the refund the app suggests. Null when neither level declares one.
 *  - `text`: the words exhibitors read (MYK9-1976): the show's text, else the club's, else
 *    the default built from `policy` and the show's registry.
 *
 * Online-only, like every read and write of the policy columns: errors (a missing column
 * before the migration is applied, a lost connection) propagate as isError and callers render
 * nothing rather than crash.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  EFFECTIVE_WITHDRAWAL_SELECT,
  resolveEffectiveWithdrawalTerms,
  type EffectiveWithdrawalRow,
  type EffectiveWithdrawalTerms,
} from './effectiveWithdrawalTerms';

export {
  EFFECTIVE_WITHDRAWAL_SELECT,
  registryFromTrials,
  type EffectiveWithdrawalTerms,
} from './effectiveWithdrawalTerms';

export function useEffectiveWithdrawalPolicy(showId: string | null | undefined) {
  return useQuery<EffectiveWithdrawalTerms>({
    queryKey: ['effective-withdrawal-policy', showId],
    enabled: !!showId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shows')
        .select(EFFECTIVE_WITHDRAWAL_SELECT)
        .eq('id', showId as string)
        .single();
      if (error) throw error;

      return resolveEffectiveWithdrawalTerms(data as unknown as EffectiveWithdrawalRow);
    },
  });
}
