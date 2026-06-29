import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { cacheStrategies } from '@/lib/queryClient';

export interface ClubStripeAccount {
  id: string;
  club_id: string;
  stripe_account_id: string;
  onboarding_complete: boolean;
  payouts_enabled: boolean;
}

/** Exported for save-time (imperative) gate checks — e.g. ShowEditPanel,
 * where a hook subscription can't see the form's possibly-changed clubId. */
export async function fetchClubStripeAccount(clubId: string): Promise<ClubStripeAccount | null> {
  const { data, error } = await supabase
    .from('club_stripe_accounts')
    .select('id, club_id, stripe_account_id, onboarding_complete, payouts_enabled')
    .eq('club_id', clubId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export function useClubStripeAccount(clubId: string | undefined) {
  return useQuery({
    queryKey: ['club-stripe-account', clubId],
    queryFn: () => fetchClubStripeAccount(clubId!),
    enabled: !!clubId,
    ...cacheStrategies.moderate,
  });
}

export interface ShowPayoutRow {
  id: string;
  amount_cents: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  // Set by cron-process-payouts on every 'failed' row. Benign markers
  // (insufficient_balance / stale_processing / entries_load_failed_post_claim)
  // self-heal on the next daily run; any other reason needs a human. Drives the
  // "Retrying" vs "Needs attention" split in resolvePayoutBadge.
  failure_reason: string | null;
  completed_at: string | null;
  created_at: string;
  show: { name: string; club_id: string } | null;
}

export function useClubPayoutHistory(clubId: string | undefined) {
  return useQuery({
    queryKey: ['club-payout-history', clubId],
    queryFn: async (): Promise<ShowPayoutRow[]> => {
      // RLS scopes rows to the club; the explicit filter keeps intent visible.
      // Cast narrows show_payouts.status (typed `string`) to the union and the
      // embedded show shape to ShowPayoutRow['show'].
      const { data, error } = await supabase
        .from('show_payouts')
        .select('id, amount_cents, status, failure_reason, completed_at, created_at, show:show_id!inner(name, club_id)')
        .eq('show.club_id', clubId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ShowPayoutRow[];
    },
    enabled: !!clubId,
    ...cacheStrategies.moderate,
  });
}

/**
 * Ask the stripe-connect-onboard edge function for a Stripe Express
 * onboarding link. The caller redirects the browser to the returned URL.
 */
export async function startConnectOnboarding(clubId: string, returnPath: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('stripe-connect-onboard', {
    body: { club_id: clubId, return_path: returnPath },
  });

  if (error) {
    throw new Error(error.message || 'Failed to start payment account setup');
  }
  if (!data?.url) {
    throw new Error('No onboarding URL returned');
  }
  return data.url;
}
