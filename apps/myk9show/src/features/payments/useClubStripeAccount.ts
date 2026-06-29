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
        .select('id, amount_cents, status, completed_at, created_at, show:show_id!inner(name, club_id)')
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
    message:
      'Your sign-in session has expired. Please sign in again, then restart payment setup.',
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
      "Something went wrong while checking your permissions. Please try again in a moment — if it keeps happening, contact support.",
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
