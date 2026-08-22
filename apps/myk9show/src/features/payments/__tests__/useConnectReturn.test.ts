/**
 * The Stripe-return wait.
 *
 * The first version of this hook waited on the account ROW appearing, and was
 * therefore dead on the only path that matters: `stripe-connect-onboard`
 * inserts `club_stripe_accounts` before it creates the onboarding link, so the
 * row is already there when the treasurer returns and the loop exited before
 * its first refetch. Caught in review, not by a test, because there were none.
 *
 * These tests pin the distinction: the wait is for the WEBHOOK-owned flag, and
 * it must run even though the row is present the whole time.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConnectReturn, CONNECT_MAX_POLLS, CONNECT_POLL_INTERVAL_MS } from '../useConnectReturn';

function setup(overrides: Partial<Parameters<typeof useConnectReturn>[0]> = {}) {
  const refetchAccount = vi.fn();
  const clearConnectParam = vi.fn();
  const props = {
    connectParam: 'return' as string | null,
    onboardingSettled: false,
    refetchAccount,
    clearConnectParam,
    ...overrides,
  };
  const view = renderHook(p => useConnectReturn(p), { initialProps: props });
  return { view, refetchAccount, clearConnectParam, props };
}

describe('useConnectReturn', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls even though the account row already exists (the regression)', () => {
    // onboardingSettled is the ONLY thing that should stop the wait. The row is
    // present on every real return, so any presence-based guard kills the flow.
    const { refetchAccount, view } = setup({ onboardingSettled: false });
    expect(view.result.current.status).toBe('confirming');
    expect(refetchAccount).toHaveBeenCalledTimes(1);
  });

  it('keeps polling on the interval until the window expires, then times out', () => {
    const { refetchAccount, view } = setup();

    act(() => {
      vi.advanceTimersByTime(CONNECT_POLL_INTERVAL_MS * CONNECT_MAX_POLLS);
    });

    expect(refetchAccount).toHaveBeenCalledTimes(CONNECT_MAX_POLLS);
    expect(view.result.current.status).toBe('timed-out');
  });

  it('stops the moment the webhook lands, without running out the window', () => {
    const { refetchAccount, view, props } = setup();

    act(() => {
      vi.advanceTimersByTime(CONNECT_POLL_INTERVAL_MS);
    });
    const callsBeforeWebhook = refetchAccount.mock.calls.length;

    view.rerender({ ...props, onboardingSettled: true });
    expect(view.result.current.status).toBe('idle');

    act(() => {
      vi.advanceTimersByTime(CONNECT_POLL_INTERVAL_MS * CONNECT_MAX_POLLS);
    });
    expect(refetchAccount).toHaveBeenCalledTimes(callsBeforeWebhook);
  });

  it('a late webhook clears a timed-out state too', () => {
    const { view, props } = setup();
    act(() => {
      vi.advanceTimersByTime(CONNECT_POLL_INTERVAL_MS * CONNECT_MAX_POLLS);
    });
    expect(view.result.current.status).toBe('timed-out');

    view.rerender({ ...props, onboardingSettled: true });
    expect(view.result.current.status).toBe('idle');
  });

  it('treats ?connect=refresh as an expired link, and does not poll', () => {
    const { view, refetchAccount } = setup({ connectParam: 'refresh' });
    expect(view.result.current.status).toBe('link-expired');
    act(() => {
      vi.advanceTimersByTime(CONNECT_POLL_INTERVAL_MS * CONNECT_MAX_POLLS);
    });
    expect(refetchAccount).not.toHaveBeenCalled();
  });

  it('does nothing at all without a connect param', () => {
    const { view, refetchAccount, clearConnectParam } = setup({ connectParam: null });
    expect(view.result.current.status).toBe('idle');
    expect(refetchAccount).not.toHaveBeenCalled();
    expect(clearConnectParam).not.toHaveBeenCalled();
  });

  it('clears the param so a reload does not replay the wait', () => {
    const { clearConnectParam } = setup();
    expect(clearConnectParam).toHaveBeenCalledTimes(1);
  });

  it('stops polling on unmount', () => {
    const { view, refetchAccount } = setup();
    const callsAtUnmount = refetchAccount.mock.calls.length;
    view.unmount();
    act(() => {
      vi.advanceTimersByTime(CONNECT_POLL_INTERVAL_MS * CONNECT_MAX_POLLS);
    });
    expect(refetchAccount).toHaveBeenCalledTimes(callsAtUnmount);
  });
});
