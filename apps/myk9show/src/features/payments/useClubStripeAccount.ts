import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { cacheStrategies } from '@/lib/queryClient';

export interface ClubStripeAccount {
  id: string;
  club_id: string;
  stripe_account_id: string;
  livemode?: boolean;
  onboarding_complete: boolean;
  payouts_enabled: boolean;
}

// The client must inspect the same mode-scoped account row as the checkout
// edge function. MYK9-579: platform_settings.stripe_livemode is what the
// client and enforce_show_publish_gate() (a database trigger, which cannot
// read a Vite env var) both treat as authoritative — it replaced the
// build-time VITE_STRIPE_LIVEMODE env var. It is NOT independently
// authoritative: every Stripe edge function derives its own livemode from
// the Stripe secret key and stripe-connect-onboard is what writes
// club_stripe_accounts.livemode, so this column and that key are flipped
// together for a cutover (see the column comment,
// supabase/migrations/20260915221500). `authenticated` already holds
// table-level SELECT on platform_settings (20260615180000), so this read
// needs no new grant.
//
// `.limit(1)` rather than `.eq('id', true)`: platform_settings is a
// singleton, so a filter on a specific column adds nothing here, and a
// filter column needs its own SELECT privilege on tables that use
// column-level grants (20260823160000's header explains the trap this
// avoids in general — it does not bite `authenticated` today, which holds
// table-level SELECT, but `.limit(1)` costs nothing and does not rely on
// that staying true).
async function fetchStripeLivemode(): Promise<boolean> {
  const { data, error } = await supabase
    .from('platform_settings')
    .select('stripe_livemode')
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.stripe_livemode === true;
}

/** Query key for the platform's current Stripe livemode. Exported so callers
 * that also key off it (useClubStripeAccount, useClubStripePaymentReadiness)
 * can invalidate together with it; a mode flip should invalidate every
 * account/readiness query at once, not wait out their own staleTime. */
export const STRIPE_LIVEMODE_QUERY_KEY = ['platform-stripe-livemode'] as const;

/** platform_settings.stripe_livemode rarely changes (only the MYK9-11
 * cutover flips it), so this is cached long — but it is still its OWN query,
 * not a bare constant, so an explicit invalidation of
 * STRIPE_LIVEMODE_QUERY_KEY at cutover time propagates into every query key
 * below that folds this value in. */
export function useStripeLivemode() {
  return useQuery({
    queryKey: STRIPE_LIVEMODE_QUERY_KEY,
    queryFn: fetchStripeLivemode,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

async function fetchClubStripeAccountForLivemode(
  clubId: string,
  livemode: boolean
): Promise<ClubStripeAccount | null> {
  const { data, error } = await supabase
    .from('club_stripe_accounts')
    .select('id, club_id, stripe_account_id, livemode, onboarding_complete, payouts_enabled')
    .eq('club_id', clubId)
    .eq('livemode', livemode)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/** Exported for save-time (imperative) gate checks — e.g. ShowEditPanel,
 * where a hook subscription can't see the form's possibly-changed clubId. */
export async function fetchClubStripeAccount(clubId: string): Promise<ClubStripeAccount | null> {
  const livemode = await fetchStripeLivemode();
  return fetchClubStripeAccountForLivemode(clubId, livemode);
}

// Both hooks below fold `useStripeLivemode()`'s value into their query key,
// but NOT into `enabled` -- gating on it resolving first would turn v5's
// `isLoading` (isPending && isFetching) false for the whole window before
// the livemode read lands, which is exactly the window ShowStatusPill's own
// "Checking the club's payment account" guard exists for. The queryFn keeps
// resolving livemode itself (fetchClubStripeAccount / -Readiness already do,
// same cost either way for this small singleton read), so correctness never
// depends on the two queries resolving in a particular order -- folding the
// value into the key is only what makes STRIPE_LIVEMODE_QUERY_KEY's
// invalidation (the MYK9-11 cutover) propagate into these, instead of
// waiting out cacheStrategies.moderate's own staleTime.
export function useClubStripeAccount(clubId: string | undefined) {
  const livemodeQuery = useStripeLivemode();
  return useQuery({
    queryKey: ['club-stripe-account', clubId, livemodeQuery.data ?? 'pending-livemode'],
    queryFn: () => fetchClubStripeAccount(clubId!),
    enabled: !!clubId,
    ...cacheStrategies.moderate,
  });
}

async function fetchClubStripePaymentReadinessForLivemode(
  clubId: string,
  livemode: boolean
): Promise<boolean> {
  const { data, error } = await supabase.rpc('can_accept_online_entry_payment', {
    p_club_id: clubId,
    p_livemode: livemode,
  });

  if (error) throw error;
  return data === true;
}

export async function fetchClubStripePaymentReadiness(clubId: string): Promise<boolean> {
  const livemode = await fetchStripeLivemode();
  return fetchClubStripePaymentReadinessForLivemode(clubId, livemode);
}

export function useClubStripePaymentReadiness(clubId: string | undefined) {
  const livemodeQuery = useStripeLivemode();
  return useQuery({
    // Same reasoning as useClubStripeAccount's key above.
    queryKey: ['club-stripe-payment-readiness', clubId, livemodeQuery.data ?? 'pending-livemode'],
    queryFn: () => fetchClubStripePaymentReadiness(clubId!),
    enabled: !!clubId,
    ...cacheStrategies.moderate,
  });
}

/**
 * One `public.show_payouts` row.
 *
 * Nothing fetches this shape directly any more: the per-show payout list that
 * did was merged into the reconciliation card, whose data comes from the
 * SECURITY DEFINER RPC instead. The type survives because the `status` union is
 * the domain vocabulary `resolvePayoutBadge` and `resolvePayoutSettlement`
 * still resolve against.
 */
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
  /** Needed to group a show's attempts; a show can hold several payout rows. */
  show_id: string;
  show: { name: string; club_id: string } | null;
}

/**
 * Calm, plain-English copy shown to a (typically non-technical) club treasurer
 * when payment setup can't start. The destructive Alert in ClubPaymentsCard
 * renders the thrown Error's message verbatim, so the friendliness has to live
 * here — never let a raw Stripe/edge-function string reach the treasurer.
 */
const CONNECT_ERROR_FALLBACK =
  "We couldn't start your payment setup. Please try again in a moment.";

// Ordered, case-insensitive matchers against the *real* error text (the edge
// function's own validation messages and the raw Stripe message it forwards on
// a 500). First match wins, so put the specific patterns before the broad ones.
// Each message states what happened in human terms AND the next step to take.
const CONNECT_ERROR_PATTERNS: Array<{ test: RegExp; message: string }> = [
  {
    // 401s: getUser failed / missing token — the session lapsed mid-flow.
    test: /authentication failed|authorization header/i,
    message: 'Your sign-in session has expired. Please sign in again, then restart payment setup.',
  },
  {
    // 403: caller genuinely isn't a club admin for this club. This is the only
    // string the edge function emits for a real permission denial — getting
    // access is the actual fix.
    test: /not authorized for this club/i,
    message:
      "Your account isn't set up to manage this club's payments. Ask a club administrator to give you access, then try again.",
  },
  {
    // 500: the RBAC predicate RPC itself errored ("Authorization check
    // failed"). This is a backend hiccup, NOT a permission problem — do not
    // send an admin chasing access they already have. Retry, then support.
    test: /authorization check failed/i,
    message:
      'Something went wrong while checking your permissions. Please try again in a moment — if it keeps happening, contact support.',
  },
  {
    // Stripe account isn't ready yet — a capability (card_payments/transfers)
    // is still inactive/pending. Continuing to Stripe is the actual fix.
    test: /capabilit|transfers .*inactive|account .*(inactive|pending|restricted)/i,
    message:
      "Stripe is still verifying your club's account. Continue to Stripe to finish the remaining steps — if you've already completed everything, give it a few minutes and try again.",
  },
  {
    // Network / provider reachability (FunctionsFetchError or Stripe API down).
    test: /failed to send a request|rate limit|timeout|network|connection/i,
    message:
      "We couldn't reach our payment provider just now. Please check your connection and try again in a moment.",
  },
];

/**
 * Translate a raw edge-function / Stripe error string into calm, treasurer-safe
 * copy. Exported for unit testing; the generic fallback covers anything
 * unrecognized (including the supabase-js "non-2xx status code" placeholder).
 */
export function mapConnectOnboardingError(raw: string | undefined | null): string {
  if (!raw) return CONNECT_ERROR_FALLBACK;
  const match = CONNECT_ERROR_PATTERNS.find(p => p.test.test(raw));
  return match ? match.message : CONNECT_ERROR_FALLBACK;
}

/**
 * Ask the stripe-connect-onboard edge function for a Stripe Express
 * onboarding link. The caller redirects the browser to the returned URL.
 *
 * On failure this throws an Error whose message is already plain-English and
 * calm — callers can surface `error.message` directly without further mapping.
 */
export async function startConnectOnboarding(clubId: string, returnPath: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('stripe-connect-onboard', {
    body: { club_id: clubId, return_path: returnPath },
  });

  if (error) {
    // supabase-js surfaces a non-2xx response as a FunctionsHttpError whose
    // .message is a generic "non-2xx status code" placeholder; the real edge /
    // Stripe text lives in the response body (mirrors useShowRefundAll).
    let raw: string | undefined = error.message;
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        raw = (await context.json())?.error ?? raw;
      } catch {
        // keep the placeholder message; mapper falls back to generic copy
      }
    }
    throw new Error(mapConnectOnboardingError(raw));
  }
  if (!data?.url) {
    throw new Error(CONNECT_ERROR_FALLBACK);
  }
  return data.url;
}
