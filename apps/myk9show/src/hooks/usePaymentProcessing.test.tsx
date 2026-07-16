import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import { MemoryRouter } from 'react-router-dom';

// ---------------------------------------------------------------------------
// paymentService is mocked at the module boundary; this suite verifies only
// what the hook itself owns: state transitions on success/failure, and
// whether a second in-flight call is guarded (task 3.1). The hook has no
// explicit in-flight guard (no early-return on state.loading) — see
// CONCERNS in the handoff for the "second invocation while in flight"
// behavior this suite documents as observed, not necessarily intended.
// ---------------------------------------------------------------------------

const createPaymentIntentMock = vi.hoisted(() => vi.fn());
const calculateEntryFeeMock = vi.hoisted(() => vi.fn());
const confirmPaymentMock = vi.hoisted(() => vi.fn());

vi.mock('@/services/payment/PaymentService', () => ({
  paymentService: {
    calculateEntryFee: calculateEntryFeeMock,
    createPaymentIntent: createPaymentIntentMock,
    confirmPayment: confirmPaymentMock,
    failPayment: vi.fn(),
    processRefund: vi.fn(),
    getPaymentHistory: vi.fn(),
    getShowPaymentSummary: vi.fn(),
    checkPaymentStatus: vi.fn(),
    generateReceipt: vi.fn(),
    testPaymentService: vi.fn(),
  },
}));

import { usePaymentProcessing } from './usePaymentProcessing';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <MemoryRouter>{children}</MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
  return wrapper;
}

describe('usePaymentProcessing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createPayment', () => {
    it('reports success and stores paymentId/clientSecret on success', async () => {
      createPaymentIntentMock.mockResolvedValue({
        paymentId: 'pay-1',
        clientSecret: 'secret-1',
      });

      const { result } = renderHook(() => usePaymentProcessing(), {
        wrapper: createWrapper(),
      });

      let outcome: boolean | undefined;
      await act(async () => {
        outcome = await result.current.createPayment(
          'entry-1',
          'user-1',
          25,
          'Entry fee'
        );
      });

      expect(outcome).toBe(true);
      await waitFor(() => {
        expect(result.current.success).toBe(true);
      });
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.paymentId).toBe('pay-1');
      expect(result.current.clientSecret).toBe('secret-1');
    });

    it('does not report success when the service throws', async () => {
      createPaymentIntentMock.mockRejectedValue(new Error('card declined'));

      const { result } = renderHook(() => usePaymentProcessing(), {
        wrapper: createWrapper(),
      });

      let outcome: boolean | undefined;
      await act(async () => {
        outcome = await result.current.createPayment(
          'entry-1',
          'user-1',
          25,
          'Entry fee'
        );
      });

      expect(outcome).toBe(false);
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
      expect(result.current.success).toBe(false);
      expect(result.current.error).toBe('card declined');
      expect(result.current.paymentId).toBeNull();
    });

    it('does not report success when the service resolves falsy', async () => {
      createPaymentIntentMock.mockResolvedValue(null);

      const { result } = renderHook(() => usePaymentProcessing(), {
        wrapper: createWrapper(),
      });

      let outcome: boolean | undefined;
      await act(async () => {
        outcome = await result.current.createPayment(
          'entry-1',
          'user-1',
          25,
          'Entry fee'
        );
      });

      expect(outcome).toBe(false);
      expect(result.current.success).toBe(false);
      expect(result.current.error).toBe('Failed to create payment');
    });

    // CONCERN: the hook has no in-flight guard — it never checks state.loading
    // before starting a new call. This test documents the OBSERVED behavior
    // (both calls run, both hit the service) rather than an intended guard.
    it('observed: a second invocation while one is in flight is NOT blocked and both calls reach the service', async () => {
      let resolveFirst: (value: { paymentId: string; clientSecret?: string }) => void;
      const firstCall = new Promise<{ paymentId: string; clientSecret?: string }>((resolve) => {
        resolveFirst = resolve;
      });
      createPaymentIntentMock
        .mockImplementationOnce(() => firstCall)
        .mockImplementationOnce(() =>
          Promise.resolve({ paymentId: 'pay-2', clientSecret: 'secret-2' })
        );

      const { result } = renderHook(() => usePaymentProcessing(), {
        wrapper: createWrapper(),
      });

      let firstOutcome: Promise<boolean>;
      let secondOutcome: Promise<boolean>;
      act(() => {
        firstOutcome = result.current.createPayment('entry-1', 'user-1', 25, 'first');
        secondOutcome = result.current.createPayment('entry-2', 'user-1', 30, 'second');
      });

      await waitFor(() => {
        expect(createPaymentIntentMock).toHaveBeenCalledTimes(2);
      });

      await act(async () => {
        resolveFirst({ paymentId: 'pay-1', clientSecret: 'secret-1' });
        await firstOutcome;
        await secondOutcome;
      });

      expect(await firstOutcome!).toBe(true);
      expect(await secondOutcome!).toBe(true);
    });
  });

  describe('calculateFee', () => {
    it('returns and stores the calculation on success', async () => {
      const calculation = {
        baseFee: 25,
        adjustments: [],
        totalFee: 25,
      };
      calculateEntryFeeMock.mockResolvedValue(calculation);

      const { result } = renderHook(() => usePaymentProcessing(), {
        wrapper: createWrapper(),
      });

      let returned;
      await act(async () => {
        returned = await result.current.calculateFee('show-1', 'Novice A');
      });

      expect(returned).toEqual(calculation);
      expect(result.current.feeCalculation).toEqual(calculation);
      expect(result.current.error).toBeNull();
    });

    it('returns null and sets error on failure', async () => {
      calculateEntryFeeMock.mockRejectedValue(new Error('bad class'));

      const { result } = renderHook(() => usePaymentProcessing(), {
        wrapper: createWrapper(),
      });

      let returned;
      await act(async () => {
        returned = await result.current.calculateFee('show-1', 'Novice A');
      });

      expect(returned).toBeNull();
      expect(result.current.error).toBe('bad class');
      expect(result.current.feeCalculation).toBeNull();
    });
  });

  describe('confirmPayment', () => {
    it('reports success when the service confirms', async () => {
      confirmPaymentMock.mockResolvedValue(true);

      const { result } = renderHook(() => usePaymentProcessing(), {
        wrapper: createWrapper(),
      });

      let outcome: boolean | undefined;
      await act(async () => {
        outcome = await result.current.confirmPayment('pay-1', 'txn-1', {
          type: 'credit_card',
        });
      });

      expect(outcome).toBe(true);
      expect(result.current.success).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it('does not report success when the service returns false', async () => {
      confirmPaymentMock.mockResolvedValue(false);

      const { result } = renderHook(() => usePaymentProcessing(), {
        wrapper: createWrapper(),
      });

      let outcome: boolean | undefined;
      await act(async () => {
        outcome = await result.current.confirmPayment('pay-1', 'txn-1', {
          type: 'credit_card',
        });
      });

      expect(outcome).toBe(false);
      expect(result.current.success).toBe(false);
      expect(result.current.error).toBe('Payment confirmation failed');
    });

    it('does not report success when the service throws', async () => {
      confirmPaymentMock.mockRejectedValue(new Error('network error'));

      const { result } = renderHook(() => usePaymentProcessing(), {
        wrapper: createWrapper(),
      });

      let outcome: boolean | undefined;
      await act(async () => {
        outcome = await result.current.confirmPayment('pay-1', 'txn-1', {
          type: 'credit_card',
        });
      });

      expect(outcome).toBe(false);
      expect(result.current.success).toBe(false);
      expect(result.current.error).toBe('network error');
    });
  });
});
