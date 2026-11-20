import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { isPublicShowStatus } from './onlineEntryGate';

/**
 * MYK9-2192: what a signed-out visitor sees when the club's payouts are off. Neutral on purpose:
 * it never says why, and never names Stripe, the club's bank account or its money.
 */
export const CARD_ENTRIES_PAUSED_MESSAGE = 'Card entries are paused. Contact the secretary.';

type PaymentMethodShow = {
  status?: string | null | undefined;
  acceptCheckPayments?: boolean | null | undefined;
  acceptCashPayments?: boolean | null | undefined;
};

/** Same defaults as the payment step: a show that never said otherwise takes both. */
export function takesCheckOrCash(show: PaymentMethodShow | null | undefined): boolean {
  return (show?.acceptCheckPayments ?? true) || (show?.acceptCashPayments ?? true);
}

const CARD_PAUSED_STALE_MS = 60 * 1000;

/**
 * True when the server says card entries are paused for this show AND the show takes neither
 * check nor cash, so Enter would lead nowhere. The answer is public_safe: one show-level boolean
 * (show_card_entries_paused, MYK9-2192), the same predicate checkout's refusal rests on. An
 * online-only read; any failure, or being offline, reads as "not paused" so the page renders as
 * it does today. A show that takes check or cash never asks.
 */
export function useShowCardEntriesPaused(show: PaymentMethodShow & { id?: string }): boolean {
  const showId = show.id;
  const asks = Boolean(showId) && isPublicShowStatus(show.status) && !takesCheckOrCash(show);
  const query = useQuery({
    queryKey: ['show-card-entries-paused', showId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('show_card_entries_paused', {
        p_show_id: showId as string,
      });
      if (error) throw error;
      return data === true;
    },
    enabled: asks,
    staleTime: CARD_PAUSED_STALE_MS,
    retry: false,
  });
  return asks && query.data === true;
}
