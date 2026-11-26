import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  toClubShowPayoutFigures,
  type ClubShowPayoutFigures,
  type ClubShowPayoutFiguresRow,
} from './clubShowPayoutFigures';

export function clubShowPayoutFiguresQueryKey(clubId: string | undefined) {
  return ['club-show-payout-figures', clubId] as const;
}

/**
 * A club's per-show Collected, Refunded, owed and Paid (MYK9-2454, owner decision A,
 * 2026-11-26: one SECURITY DEFINER function computes them; the Payments tab only renders).
 *
 * A direct RPC, not a replicated read, on purpose: these are money facts only the server
 * knows (entries.refund_amount is service-role-only), so the read is online-only by design.
 * A failed read throws and the query is in error; it is never mapped to an empty list, which
 * would read as "no money" for a club that is owed some.
 */
export async function fetchClubShowPayoutFigures(clubId: string): Promise<ClubShowPayoutFigures[]> {
  const { data, error } = await supabase.rpc('club_show_payout_figures', { p_club_id: clubId });
  if (error) throw error;
  if (!Array.isArray(data)) {
    throw new Error('Could not read the club payout figures.');
  }
  return (data as ClubShowPayoutFiguresRow[]).map(toClubShowPayoutFigures);
}

export function useClubShowPayoutFigures(clubId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: clubShowPayoutFiguresQueryKey(clubId),
    queryFn: () => fetchClubShowPayoutFigures(clubId as string),
    enabled: enabled && !!clubId,
  });
}
