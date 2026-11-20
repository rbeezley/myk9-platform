import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { isPublicShowStatus } from './onlineEntryGate';

/**
 * MYK9-2192: what a signed-out visitor sees when the club's payouts are off. Neutral on purpose:
 * it never says why, and never names Stripe, the club's bank account or its money.
 */
export const CARD_ENTRIES_PAUSED_MESSAGE = 'Card entries are paused. Contact the secretary.';

export type PaymentMethodShow = {
  id?: string | undefined;
  status?: string | null | undefined;
  acceptCheckPayments?: boolean | null | undefined;
  acceptCashPayments?: boolean | null | undefined;
};

/** Same defaults as the payment step: a show that never said otherwise takes both. */
export function takesCheckOrCash(show: PaymentMethodShow | null | undefined): boolean {
  return (show?.acceptCheckPayments ?? true) || (show?.acceptCashPayments ?? true);
}

const CARD_PAUSED_STALE_MS = 60 * 1000;
/** The server reads at most this many ids per call; a longer list is asked in slices. */
const SERVER_ID_CAP = 500;

export const NO_PAUSED_SHOWS: ReadonlySet<string> = new Set<string>();

/** The shows worth asking about: public, and taking neither check nor cash. Sorted, unique. */
export function cardPausedCandidateIds(shows: readonly PaymentMethodShow[]): string[] {
  const ids = new Set<string>();
  for (const show of shows) {
    if (show.id && isPublicShowStatus(show.status) && !takesCheckOrCash(show)) ids.add(show.id);
  }
  return [...ids].sort();
}

function usePausedAmong(ids: string[]): ReadonlySet<string> {
  const query = useQuery({
    queryKey: ['shows-card-entries-paused', ids],
    queryFn: async () => {
      const paused: string[] = [];
      for (let i = 0; i < ids.length; i += SERVER_ID_CAP) {
        const { data, error } = await supabase.rpc('shows_card_entries_paused', {
          p_show_ids: ids.slice(i, i + SERVER_ID_CAP),
        });
        if (error) throw error;
        paused.push(...(data ?? []));
      }
      return paused;
    },
    enabled: ids.length > 0,
    staleTime: CARD_PAUSED_STALE_MS,
    retry: false,
    // A changed list (a show added, a sign-in) keeps the last answer until the new one lands,
    // so a paused show never flashes back to open in between.
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const asked = ids.length > 0;
  return useMemo(() => (asked && data ? new Set(data) : NO_PAUSED_SHOWS), [asked, data]);
}

/**
 * The ids, among the given shows, whose card entries are paused (shows_card_entries_paused,
 * MYK9-2192, the same predicate checkout's refusal rests on). ONE query for the whole list,
 * keyed by the sorted candidate ids. An online-only read: any failure, or being offline, reads
 * as an empty set so the page renders as it does today. A show that takes check or cash, or is
 * not public, is never asked about.
 */
export function useShowsCardEntriesPaused(
  shows: readonly PaymentMethodShow[]
): ReadonlySet<string> {
  return usePausedAmong(cardPausedCandidateIds(shows));
}

/** The detail page: the same batched function, asked about one show. */
export function useShowCardEntriesPaused(show: PaymentMethodShow): boolean {
  const paused = usePausedAmong(cardPausedCandidateIds([show]));
  return show.id !== undefined && paused.has(show.id);
}
