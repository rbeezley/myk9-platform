import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));

import { useApprovePayout, useHoldPayout } from './usePayoutApprovalActions';

let queryClient: QueryClient;
function createWrapper() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/**
 * A refusal over stale figures is answered by the new figures appearing, so the
 * ledger must reload whether the call succeeded or was refused.
 */
describe('the ledger reloads after every approve and hold', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it.each([
    ['approve', 'succeeds', { data: 'approved', error: null }],
    ['approve', 'is refused', { data: null, error: { code: '22023', message: 'x' } }],
    ['hold', 'succeeds', { data: 'held', error: null }],
    ['hold', 'is refused', { data: null, error: { code: '22023', message: 'x' } }],
  ] as const)('when %s %s', async (action, _outcome, response) => {
    rpc.mockResolvedValue(response);
    const { result } = renderHook(
      () => (action === 'approve' ? useApprovePayout() : useHoldPayout()),
      { wrapper: createWrapper() }
    );
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await act(async () => {
      await result.current
        .mutateAsync({
          payoutId: 'p',
          amountCents: 1,
          stripeAccountId: 'acct_1',
          reason: 'Wait',
        } as never)
        .catch(() => undefined);
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'payout-ledger'] });
  });
});

/**
 * The app's real defaults retry a mutation once and pause it offline to replay
 * on reconnect. Neither may apply to a payout decision: a cancelled password
 * prompt would open a second one, and an offline click would land later.
 */
describe('payout decisions under the app default mutation policy', () => {
  function appDefaultWrapper() {
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: 3, networkMode: 'online' } },
    });
    return ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  beforeEach(() => {
    rpc.mockReset();
  });

  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('runs a refused approve once, never again on its own', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'MKAUT', message: 'Recent sign-in' } });
    const { result } = renderHook(() => useApprovePayout(), { wrapper: appDefaultWrapper() });
    await act(async () => {
      await result.current
        .mutateAsync({ payoutId: 'p', amountCents: 1, stripeAccountId: 'acct_1' })
        .catch(() => undefined);
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('runs (and so fails) at once while offline instead of waiting to replay', async () => {
    onlineManager.setOnline(false);
    rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useHoldPayout(), { wrapper: appDefaultWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ payoutId: 'p', reason: 'Wait' }).catch(() => undefined);
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('keeps the hold reason out of the error log', async () => {
    rpc.mockResolvedValue({ data: 'held', error: null });
    const { result } = renderHook(() => useHoldPayout(), { wrapper: appDefaultWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ payoutId: 'p', reason: 'Bank dispute' });
    });
    const [mutation] = queryClient.getMutationCache().getAll();
    expect(mutation.meta).toEqual({ sensitiveVariables: true });
  });
});

describe('useApprovePayout', () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: 'approved', error: null });
  });

  it('sends the amount and the Stripe account the operator was shown', async () => {
    const { result } = renderHook(() => useApprovePayout(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        payoutId: 'payout-1',
        amountCents: 12345,
        stripeAccountId: 'acct_shown',
      });
    });
    expect(rpc).toHaveBeenCalledWith('approve_show_payout', {
      p_payout_id: 'payout-1',
      p_amount_cents: 12345,
      p_expected_stripe_account_id: 'acct_shown',
    });
  });

  it('surfaces the server refusal untouched for the screen to describe', async () => {
    const refusal = { code: '22023', message: 'The amount is now 13000 cents; review it again' };
    rpc.mockResolvedValue({ data: null, error: refusal });
    const { result } = renderHook(() => useApprovePayout(), { wrapper: createWrapper() });
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          payoutId: 'payout-1',
          amountCents: 12345,
          stripeAccountId: 'acct_shown',
        })
      ).rejects.toBe(refusal);
    });
  });
});

describe('useHoldPayout', () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: 'held', error: null });
  });

  it('holds with the trimmed reason', async () => {
    const { result } = renderHook(() => useHoldPayout(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ payoutId: 'payout-1', reason: '  Club asked to wait  ' });
    });
    expect(rpc).toHaveBeenCalledWith('hold_show_payout', {
      p_payout_id: 'payout-1',
      p_reason: 'Club asked to wait',
    });
  });

  it('refuses a blank or over-long reason without calling the server', async () => {
    const { result } = renderHook(() => useHoldPayout(), { wrapper: createWrapper() });
    await act(async () => {
      await expect(result.current.mutateAsync({ payoutId: 'p', reason: '   ' })).rejects.toThrow(
        'Say why the payout is held'
      );
      await expect(
        result.current.mutateAsync({ payoutId: 'p', reason: 'x'.repeat(501) })
      ).rejects.toThrow('Keep the reason under 500 characters');
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
