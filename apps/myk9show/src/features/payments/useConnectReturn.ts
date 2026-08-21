/**
 * What the Bank account card shows in the seconds AFTER a treasurer comes back
 * from Stripe's hosted onboarding form.
 *
 * INTENT: the row this card reads (`club_stripe_accounts`) is written by a
 * Stripe *webhook*, not by the redirect. So on `?connect=return` the row is
 * routinely still absent for a few seconds. The card used to do one `refetch()`
 * and then render its ordinary not-connected copy, which told a treasurer who
 * had just spent ten minutes entering an EIN and the last 4 of their SSN that
 * "No bank account is connected yet, so your club can't receive entry fees."
 * That is the precise abandonment moment the pre-flight checklist exists to
 * prevent, and the likely recovery is to redo onboarding from the start.
 *
 * So absence is treated as "not confirmed yet" for a bounded window, and only
 * then as a fact the treasurer should act on. `?connect=refresh` is Stripe's
 * signal that the link expired or was abandoned, which is a different sentence
 * and a different button.
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
  /** Whether the account row is present yet. */
  accountPresent: boolean;
  refetchAccount: () => void;
  /** Remove `?connect=` so a reload does not replay this flow. */
  clearConnectParam: () => void;
}

export interface UseConnectReturnResult {
  status: ConnectReturnStatus;
}

export function useConnectReturn({
  connectParam,
  accountPresent,
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
  const accountPresentRef = useRef(accountPresent);
  useEffect(() => {
    accountPresentRef.current = accountPresent;
  }, [accountPresent]);

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
      if (accountPresentRef.current) return;
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

  // Derived, not stored: the moment the row shows up, any waiting copy is stale
  // regardless of which phase the poll loop reached. Deriving avoids a
  // state-sync effect that would race the loop's own setStatus.
  const resolved =
    accountPresent && (status === 'confirming' || status === 'timed-out') ? 'idle' : status;

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
