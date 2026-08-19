/**
 * MYK9-207: after the initial 30s verification window parks, the success page
 * must keep re-checking on its own (bounded) and re-verify on tab focus, so a
 * paid-then-refunded cart reaches "Payment Refunded" without manual action.
 * Also covers the truthful parked copy: the refund-on-overflow possibility,
 * and the distinct not_found state for a row this account cannot see.
 */

import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import {
  BACKGROUND_RECHECK_INTERVAL_MS,
  MAX_BACKGROUND_RECHECKS,
} from '@/features/payments/checkoutVerification';

const verifyCheckoutSessionMock = vi.hoisted(() => vi.fn());
const resetCartMock = vi.hoisted(() => vi.fn());
const entriesQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/stripe', () => ({
  verifyCheckoutSession: verifyCheckoutSessionMock,
}));

vi.mock('@/store/cartStore', () => ({
  useCartStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      cart: null,
      reset: resetCartMock,
    }),
}));

vi.mock('@/lib/supabase', () => {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    in: entriesQueryMock,
  };

  return {
    supabase: {
      from: vi.fn(() => builder),
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
      },
    },
  };
});

import CheckoutSuccessPage from '@/pages/CheckoutSuccessPage';

const processingResult = {
  success: false,
  verificationStatus: 'processing',
  error: 'Your payment is still processing.',
} as const;

const notFoundResult = {
  success: false,
  verificationStatus: 'not_found',
  error: "We can't find this payment on this account yet.",
} as const;

const overflowRefundResult = {
  success: true,
  verificationStatus: 'succeeded',
  checkoutOutcome: 'full_overflow_refund',
  orderId: 'order-refunded',
  entryIds: [],
  refundAmount: 6420,
  refundStatus: 'issued',
  confirmationNumber: 'pi_refunded',
} as const;

/** Run the initial poll to its parked state without firing background timers. */
async function parkInitialPoll() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(31_000);
  });
}

describe('CheckoutSuccessPage background re-check (MYK9-207)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    entriesQueryMock.mockResolvedValue({ data: [], error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-checks automatically after the poll window and renders the refund outcome', async () => {
    verifyCheckoutSessionMock.mockResolvedValue(processingResult);

    render(<CheckoutSuccessPage />, {
      initialRoute: '/checkout/success?session_id=cs_auto_recheck',
    });

    await parkInitialPoll();
    expect(screen.getByRole('heading', { name: 'Payment Still Processing' })).toBeInTheDocument();

    verifyCheckoutSessionMock.mockResolvedValue(overflowRefundResult);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BACKGROUND_RECHECK_INTERVAL_MS + 1_000);
    });

    expect(screen.getByText('Payment Refunded')).toBeInTheDocument();
    expect(
      screen.getByText(/remaining spots filled before your paid entries could be created/i)
    ).toBeInTheDocument();
  });

  it('re-verifies immediately when the tab regains focus', async () => {
    verifyCheckoutSessionMock.mockResolvedValue(processingResult);

    render(<CheckoutSuccessPage />, {
      initialRoute: '/checkout/success?session_id=cs_focus_recheck',
    });

    await parkInitialPoll();
    expect(screen.getByRole('heading', { name: 'Payment Still Processing' })).toBeInTheDocument();

    verifyCheckoutSessionMock.mockResolvedValue(overflowRefundResult);
    await act(async () => {
      fireEvent(window, new Event('focus'));
      await Promise.resolve();
    });

    expect(screen.getByText('Payment Refunded')).toBeInTheDocument();
  });

  it('names the refund-on-overflow possibility while parked', async () => {
    verifyCheckoutSessionMock.mockResolvedValue(processingResult);

    render(<CheckoutSuccessPage />, {
      initialRoute: '/checkout/success?session_id=cs_parked_copy',
    });

    await parkInitialPoll();

    expect(screen.getByText(/your payment is refunded automatically in full/i)).toBeInTheDocument();
    expect(screen.getByText(/keeps checking and will update on its own/i)).toBeInTheDocument();
  });

  it('parks a persistent not_found with account guidance instead of "processing"', async () => {
    verifyCheckoutSessionMock.mockResolvedValue(notFoundResult);

    render(<CheckoutSuccessPage />, {
      initialRoute: '/checkout/success?session_id=cs_not_found',
    });

    await parkInitialPoll();

    expect(screen.getByRole('heading', { name: 'Payment Not Found Yet' })).toBeInTheDocument();
    expect(
      screen.getByText(/signed in to a different account, sign in as that account/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/do not submit another payment/i)).toBeInTheDocument();
  });

  it('stops re-checking after the bounded number of background attempts', async () => {
    verifyCheckoutSessionMock.mockResolvedValue(processingResult);

    render(<CheckoutSuccessPage />, {
      initialRoute: '/checkout/success?session_id=cs_bounded',
    });

    // Run EVERY timer to exhaustion: the initial poll's 11 attempts plus the
    // bounded background chain. If the chain were unbounded this would never
    // terminate — the test doubles as the runaway-timer guard. Two drains: the
    // background effect only mounts when React flushes effects at the first
    // act boundary, so its timers don't exist until then.
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(verifyCheckoutSessionMock).toHaveBeenCalledTimes(11 + MAX_BACKGROUND_RECHECKS);
    expect(screen.getByRole('heading', { name: 'Payment Still Processing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check Payment Status' })).toBeInTheDocument();
  });
});
