import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  GUEST_READ_QUERY_OPTIONS,
  resolveGuestRead,
  useQueryOnlineStatus,
} from '@/hooks/guestServerRead';
import { isPublicShowStatus } from './onlineEntryGate';

/**
 * MYK9-2192: what a signed-out visitor sees when the club's payouts are off. Neutral on purpose:
 * it never says why, and never names Stripe, the club's bank account or its money.
 */
export const CARD_ENTRIES_PAUSED_MESSAGE = 'Card entries are paused. Contact the secretary.';
export const CARD_PAYMENTS_PAUSED_PAY_OTHER_MESSAGE =
  'Card payments are paused. Pay by check or cash.';

/** `loading` and `unknown` are their own states: neither ever reads as "not paused". */
export type ShowCardEntriesState = 'loading' | 'paused' | 'open' | 'unknown';

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

/**
 * Whether this one show's card entries are paused (shows_card_entries_paused, the answer an
 * anonymous caller may read and the same predicate checkout's refusal rests on). Online-only:
 * a failed or offline read is `unknown`, not `open`, and an answer cached from an earlier visit
 * never counts: only a read that completed since THIS mount does (guestServerRead.ts). A show that is not public is never asked
 * about and reads `open` (nothing to pause).
 */
export function useShowCardEntriesPaused(
  show: PaymentMethodShow,
  enabled = true
): ShowCardEntriesState {
  const showId = show.id;
  const asked = enabled && showId !== undefined && isPublicShowStatus(show.status);
  const isOnline = useQueryOnlineStatus();
  const query = useQuery({
    queryKey: ['show-card-entries-paused', showId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('shows_card_entries_paused', {
        p_show_ids: [showId as string],
      });
      if (error) throw error;
      return (data ?? []).includes(showId as string);
    },
    enabled: asked,
    ...GUEST_READ_QUERY_OPTIONS,
    // The app's bounded retry (queryClient.ts) applies: a temporary 5xx retries while Enter
    // stays withheld as "checking", and only a read that still fails reads as unknown.
  });
  if (!asked) return 'open';
  const read = resolveGuestRead(query, isOnline);
  if (read.kind === 'loading') return 'loading';
  if (read.kind !== 'ready') return 'unknown';
  return read.data ? 'paused' : 'open';
}

export type CardEntriesLanding = {
  /** Withholds Enter on the landing; undefined leaves the existing decision alone. */
  pendingReason:
    'card_entries_checking' | 'card_entries_paused' | 'online_setting_unknown' | undefined;
  /** The one extra line for a show that still takes check or cash while card is paused. */
  note: string | null;
};

/**
 * MYK9-2192: what the public show page does with the server's answer. Card-only and paused:
 * no Enter, neutral copy. Check or cash and paused: Enter stays, one line. Loading: no Enter,
 * nothing alarming. Unknown (failed or offline): no Enter, the existing neutral not-open copy.
 */
export function cardEntriesLanding(
  state: ShowCardEntriesState,
  show: PaymentMethodShow
): CardEntriesLanding {
  const cardOnly = !takesCheckOrCash(show);
  switch (state) {
    case 'open':
      return { pendingReason: undefined, note: null };
    case 'loading':
      return { pendingReason: 'card_entries_checking', note: null };
    case 'unknown':
      return { pendingReason: 'online_setting_unknown', note: null };
    case 'paused':
      return cardOnly
        ? { pendingReason: 'card_entries_paused', note: null }
        : { pendingReason: undefined, note: CARD_PAYMENTS_PAUSED_PAY_OTHER_MESSAGE };
  }
}
