import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import type { WaitListEntry } from '@/types/waitlist-types';

/** Stable empty result. `query.data ?? []` would allocate a fresh array on
 * every render, which alone is enough to defeat the memo below. */
const NO_ENTRIES: WaitListEntry[] = [];

interface WaitlistEntryRow {
  id: string;
  class_id: string;
  position: number;
  status: 'waiting' | 'offered' | 'accepted' | 'declined' | 'expired';
  offered_at: string | null;
  offer_expires_at: string | null;
  promoted_entry_id: string | null;
  created_at: string;
  classes: {
    name: string;
    trials: {
      shows: { name: string } | null;
    } | null;
  } | null;
  dogs: { name: string | null; call_name: string | null } | null;
  exhibitor_profiles: {
    people: { first_name: string | null; last_name: string | null } | null;
  } | null;
}

const MY_WAITLIST_KEY = ['my-waitlist-entries'] as const;
const MY_FOCUSED_WAITLIST_OFFER_KEY = ['my-focused-waitlist-offer'] as const;

interface StartWaitlistPaymentInput {
  entryId: string;
  waitlistEntryId: string;
}

function mapWaitlistEntry(row: WaitlistEntryRow, exhibitorId: string): WaitListEntry {
  const person = row.exhibitor_profiles?.people;
  const exhibitorName = person
    ? `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim()
    : 'Unknown';
  return {
    id: row.id,
    classId: row.class_id,
    className: row.classes?.name ?? 'Unknown Class',
    showName: row.classes?.trials?.shows?.name ?? 'Unknown Show',
    exhibitorId,
    exhibitorName,
    dogId: null,
    dogName: row.dogs?.call_name ?? row.dogs?.name ?? 'Unknown Dog',
    handlerId: null,
    position: row.position,
    status: row.status,
    offeredAt: row.offered_at,
    offerExpiresAt: row.offer_expires_at,
    promotedEntryId: row.promoted_entry_id,
    createdAt: row.created_at,
  };
}

const WAITLIST_ENTRY_SELECT = `
  id,
  class_id,
  position,
  status,
  offered_at,
  offer_expires_at,
  promoted_entry_id,
  created_at,
  classes (
    name,
    trials (
      shows ( name )
    )
  ),
  dogs ( name, call_name ),
  exhibitor_profiles (
    people!person_id ( first_name, last_name )
  )
`;

export function useMyWaitlistEntries(
  exhibitorId: string | undefined,
  focusedOfferId: string | null = null
) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...MY_WAITLIST_KEY, exhibitorId],
    queryFn: async (): Promise<WaitListEntry[]> => {
      const { data, error } = await supabase
        .from('waitlist_entries')
        .select(WAITLIST_ENTRY_SELECT)
        .eq('exhibitor_id', exhibitorId!)
        .in('status', ['waiting', 'offered'])
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data as unknown as WaitlistEntryRow[]).map(row =>
        mapWaitlistEntry(row, exhibitorId!)
      );
    },
    enabled: !!exhibitorId,
  });

  // Keep the normal list limited to active positions. A notification deep link
  // may arrive after the cron has closed the offer, so fetch only that owned row
  // separately to explain its terminal state without creating a history view.
  const focusedOfferQuery = useQuery({
    queryKey: [...MY_FOCUSED_WAITLIST_OFFER_KEY, exhibitorId, focusedOfferId],
    queryFn: async (): Promise<WaitListEntry | null> => {
      const { data, error } = await supabase
        .from('waitlist_entries')
        .select(WAITLIST_ENTRY_SELECT)
        .eq('id', focusedOfferId!)
        .eq('exhibitor_id', exhibitorId!)
        .maybeSingle();

      if (error) throw error;
      return data ? mapWaitlistEntry(data as unknown as WaitlistEntryRow, exhibitorId!) : null;
    },
    enabled: !!exhibitorId && !!focusedOfferId,
  });

  const withdraw = useMutation({
    mutationFn: async (waitlistEntryId: string) => {
      const { error } = await supabase.from('waitlist_entries').delete().eq('id', waitlistEntryId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...MY_WAITLIST_KEY, exhibitorId] });
    },
  });

  const invalidateWaitlistOffer = (waitlistEntryId: string) => {
    queryClient.invalidateQueries({ queryKey: [...MY_WAITLIST_KEY, exhibitorId] });
    queryClient.invalidateQueries({
      queryKey: [...MY_FOCUSED_WAITLIST_OFFER_KEY, exhibitorId, waitlistEntryId],
    });
  };

  const startPayment = useMutation({
    mutationFn: async ({ entryId, waitlistEntryId }: StartWaitlistPaymentInput): Promise<void> => {
      const returnUrl = new URL('/exhibitor/entries', window.location.origin);
      returnUrl.searchParams.set('waitlistOffer', waitlistEntryId);

      const { data, error } = await supabase.functions.invoke('stripe-payment-link', {
        body: {
          entry_ids: [entryId],
          success_url: returnUrl.toString(),
          cancel_url: returnUrl.toString(),
        },
      });
      if (error || !data?.url) {
        throw new Error('We could not start payment. Please try again.');
      }

      window.location.assign(data.url);
    },
    onError: (_error, variables) => invalidateWaitlistOffer(variables.waitlistEntryId),
  });

  const decline = useMutation({
    mutationFn: async (waitlistEntryId: string) => {
      const { error } = await supabase.functions.invoke('decline-waitlist-offer', {
        body: { waitlist_entry_id: waitlistEntryId },
      });
      if (error) throw new Error('We could not decline this offer. Please try again.');
    },
    onSuccess: (_data, waitlistEntryId) => invalidateWaitlistOffer(waitlistEntryId),
    onError: (_error, waitlistEntryId) => invalidateWaitlistOffer(waitlistEntryId),
  });

  const entries = query.data ?? NO_ENTRIES;
  const focusedOffer = focusedOfferQuery.data;
  // Memoised because WaitListSection runs an effect over this array that can
  // call back into a refetch. An unstable identity turned that into a loop:
  // refetch -> new array -> effect re-fires -> refetch. The trigger is real —
  // returning from Stripe with `?waitlistOffer=<id>` for an offer that has
  // expired but is still in `offered` state, so it is not in the active list
  // and arrives only through the focused query.
  const combinedEntries = useMemo(
    () =>
      focusedOffer && !entries.some(entry => entry.id === focusedOffer.id)
        ? [focusedOffer, ...entries]
        : entries,
    [entries, focusedOffer]
  );

  const { refetch: refetchActiveWaitlistOffers } = query;
  const { refetch: refetchFocusedWaitlistOffer } = focusedOfferQuery;
  const refetchWaitlistOffers = useCallback(async () => {
    await refetchActiveWaitlistOffers();
    if (focusedOfferId) await refetchFocusedWaitlistOffer();
  }, [focusedOfferId, refetchActiveWaitlistOffers, refetchFocusedWaitlistOffer]);

  return {
    entries: combinedEntries,
    isLoading: query.isLoading || focusedOfferQuery.isLoading,
    error: query.error?.message ?? focusedOfferQuery.error?.message ?? null,
    withdraw,
    startPayment,
    decline,
    refetchWaitlistOffers,
  };
}
