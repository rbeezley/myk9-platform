import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
