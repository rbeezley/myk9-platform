/**
 * What the Bank account card shows in the seconds AFTER a treasurer comes back
 * from Stripe's hosted onboarding form.
 *
 * INTENT: `stripe-connect-onboard` INSERTS the `club_stripe_accounts` row
 * before it creates the onboarding link, so the row is already present when the
 * treasurer comes back. What is NOT present is the part a Stripe *webhook*
 * owns: `onboarding_complete` and `payouts_enabled`. Both sit false until the
 * `account.updated` event lands, seconds later.
 *
 * The card used to do one `refetch()` and then render whatever the un-updated
 * row implied, which told a treasurer who had just finished the Stripe form,
 * after entering an EIN and the last 4 of their SSN, that "Your setup with
 * Stripe isn't finished yet." That is the precise abandonment moment the
 * pre-flight checklist exists to prevent, and the likely recovery is to walk
 * back through onboarding they already completed.
 *
 * So an unsettled flag is treated as "not confirmed yet" for a bounded window,
 * and only then as a fact the treasurer should act on. Waiting on row PRESENCE
 * instead would exit before the first poll, since the row never went missing.
 * `?connect=refresh` is Stripe's signal that the link expired or was abandoned,
 * which is a different sentence and a different button.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type ConnectReturnStatus = 'idle' | 'confirming' | 'timed-out' | 'link-expired';

/** Poll cadence while waiting for Stripe's webhook to land the account row. */
export const CONNECT_POLL_INTERVAL_MS = 2000;
/** ~12s of grace before we stop claiming it is still on its way. */
export const CONNECT_MAX_POLLS = 6;

interface UseConnectReturnOptions {
  /** The `connect` search param Stripe redirected back with. */
  connectParam: string | null;
  /**
   * Whether the webhook-owned half of the account row has landed. NOT "does the
   * row exist" -- the row is inserted client-side before the redirect.
   */
  onboardingSettled: boolean;
  refetchAccount: () => void;
  /** Remove `?connect=` so a reload does not replay this flow. */
  clearConnectParam: () => void;
}

export interface UseConnectReturnResult {
  status: ConnectReturnStatus;
}

export function useConnectReturn({
  connectParam,
  onboardingSettled,
  refetchAccount,
  clearConnectParam,
}: UseConnectReturnOptions): UseConnectReturnResult {
  // Captured ONCE at mount, for two reasons. The redirect back from Stripe is a
  // full navigation, so this component always mounts fresh with the param
  // present; and the effect below deletes the param, which would otherwise make
  // it a dependency that changes the instant the effect runs.
  const [initialParam] = useState(connectParam);
  // Seeded from the param rather than assigned inside the effect: setting state
  // synchronously in an effect triggers a cascading render, and the lint rule
  // that forbids it is right to.
  const [status, setStatus] = useState<ConnectReturnStatus>(() => {
    if (connectParam === 'refresh') return 'link-expired';
    if (connectParam === 'return') return 'confirming';
    return 'idle';
  });

  // Read inside the poll callback, which outlives the render that scheduled it.
  const settledRef = useRef(onboardingSettled);
  useEffect(() => {
    settledRef.current = onboardingSettled;
  }, [onboardingSettled]);

  useEffect(() => {
    if (!initialParam) return;
    clearConnectParam();
    if (initialParam !== 'return') return;

    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Self-scheduling rather than setInterval: each hop decides whether there is
    // anything left to wait for, so a webhook that lands on poll 2 stops the
    // loop instead of running out the full window.
    const poll = () => {
      if (cancelled) return;
      if (settledRef.current) return;
      if (attempts >= CONNECT_MAX_POLLS) {
        setStatus('timed-out');
        return;
      }
      attempts += 1;
      refetchAccount();
      timer = setTimeout(poll, CONNECT_POLL_INTERVAL_MS);
    };
    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [initialParam, clearConnectParam, refetchAccount]);

  // Derived, not stored: the moment the webhook lands, any waiting copy is stale
  // regardless of which phase the poll loop reached. Deriving avoids a
  // state-sync effect that would race the loop's own setStatus.
  const resolved =
    onboardingSettled && (status === 'confirming' || status === 'timed-out') ? 'idle' : status;

  return { status: resolved };
}

/** Stable `clearConnectParam` for the card, so the poll effect is not restarted. */
export function useClearConnectParam(
  setSearchParams: (
    updater: (prev: URLSearchParams) => URLSearchParams,
    options?: { replace?: boolean }
  ) => void
): () => void {
  return useCallback(() => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.delete('connect');
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);
}
