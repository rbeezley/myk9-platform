import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';

const verifyCheckoutSessionMock = vi.hoisted(() => vi.fn());
const resetCartMock = vi.hoisted(() => vi.fn());
const entriesQueryMock = vi.hoisted(() => vi.fn());
const cartState = vi.hoisted(() => ({ cart: null as { id: string } | null }));

vi.mock('@/lib/stripe', () => ({
  verifyCheckoutSession: verifyCheckoutSessionMock,
}));

vi.mock('@/store/cartStore', () => ({
  useCartStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      cart: cartState.cart,
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

async function finishVerificationTimers() {
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}

describe('CheckoutSuccessPage terminal verification states', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    entriesQueryMock.mockResolvedValue({ data: [], error: null });
    cartState.cart = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ends bounded polling in an explicit still-processing state', async () => {
    verifyCheckoutSessionMock.mockResolvedValue({
      success: false,
      verificationStatus: 'processing',
      error: 'Your payment is still processing.',
    });

    render(<CheckoutSuccessPage />, {
      initialRoute: '/checkout/success?session_id=cs_processing',
    });

    await finishVerificationTimers();

    expect(screen.getByRole('heading', { name: 'Payment Still Processing' })).toBeInTheDocument();
    expect(screen.getByText(/do not submit another payment/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check Payment Status' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View My Entries' })).toHaveAttribute(
      'href',
      '/exhibitor/entries'
    );
    expect(resetCartMock).not.toHaveBeenCalled();
  });

  it('shows a known terminal payment failure without implying success', async () => {
    verifyCheckoutSessionMock.mockResolvedValue({
      success: false,
      verificationStatus: 'failed',
      error: 'Your payment was not completed.',
    });

    render(<CheckoutSuccessPage />, {
      initialRoute: '/checkout/success?session_id=cs_failed',
    });

    await finishVerificationTimers();

    expect(screen.getByRole('heading', { name: 'Payment Not Completed' })).toBeInTheDocument();
    expect(screen.getByText('Your payment was not completed.')).toBeInTheDocument();
    expect(screen.queryByText(/likely successful/i)).not.toBeInTheDocument();
  });

  it('keeps an unavailable verification result distinct from payment failure', async () => {
    verifyCheckoutSessionMock.mockResolvedValue({
      success: false,
      verificationStatus: 'unavailable',
      error: 'We could not check your payment status right now.',
    });

    render(<CheckoutSuccessPage />, {
      initialRoute: '/checkout/success?session_id=cs_unavailable',
    });

    await finishVerificationTimers();

    expect(screen.getByRole('heading', { name: 'Payment Status Unavailable' })).toBeInTheDocument();
    expect(screen.getByText(/do not submit another payment/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Payment Not Completed' })
    ).not.toBeInTheDocument();
  });

  it('retries one transient unavailable result before showing a terminal state', async () => {
    verifyCheckoutSessionMock
      .mockResolvedValueOnce({
        success: false,
        verificationStatus: 'unavailable',
        error: 'We could not check your payment status right now.',
      })
      .mockResolvedValueOnce({
        success: true,
        verificationStatus: 'succeeded',
        orderId: 'order-after-retry',
        entryIds: [],
        confirmationNumber: 'pi_after_retry',
      });

    render(<CheckoutSuccessPage />, {
      initialRoute: '/checkout/success?session_id=cs_transient',
    });

    await finishVerificationTimers();

    expect(verifyCheckoutSessionMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText('pi_after_retry')).toBeInTheDocument();
  });

  it('explains the bounded wait while payment verification is loading', () => {
    verifyCheckoutSessionMock.mockReturnValue(new Promise(() => {}));

    render(<CheckoutSuccessPage />, {
      initialRoute: '/checkout/success?session_id=cs_slow',
    });

    expect(screen.getByText(/can take up to 30 seconds/i)).toBeInTheDocument();
  });

  it('stops slow processing checks at the overall 30-second deadline', async () => {
    verifyCheckoutSessionMock.mockImplementation(
      () =>
        new Promise(resolve => {
          setTimeout(
            () =>
              resolve({
                success: false,
                verificationStatus: 'processing',
                error: 'Your payment is still processing.',
              }),
            7000
          );
        })
    );

    render(<CheckoutSuccessPage />, {
      initialRoute: '/checkout/success?session_id=cs_slow_processing',
    });

    await finishVerificationTimers();

    expect(verifyCheckoutSessionMock).toHaveBeenCalledTimes(4);
    expect(screen.getByRole('heading', { name: 'Payment Status Unavailable' })).toBeInTheDocument();
  });

  it('ends in unavailable when a verification request never settles', async () => {
    verifyCheckoutSessionMock.mockReturnValue(new Promise(() => {}));

    render(<CheckoutSuccessPage />, {
      initialRoute: '/checkout/success?session_id=cs_offline',
    });

    await finishVerificationTimers();

    expect(screen.getByRole('heading', { name: 'Payment Status Unavailable' })).toBeInTheDocument();
    expect(screen.getByText(/do not submit another payment/i)).toBeInTheDocument();
    expect(resetCartMock).not.toHaveBeenCalled();
  });

  it('ends in unavailable when verification rejects', async () => {
    verifyCheckoutSessionMock.mockRejectedValue(new Error('network offline'));

    render(<CheckoutSuccessPage />, {
      initialRoute: '/checkout/success?session_id=cs_rejected',
    });

    await finishVerificationTimers();

    expect(screen.getByRole('heading', { name: 'Payment Status Unavailable' })).toBeInTheDocument();
    expect(resetCartMock).not.toHaveBeenCalled();
  });

  it('does not let entry-detail hydration delay confirmed success', async () => {
    verifyCheckoutSessionMock.mockResolvedValue({
      success: true,
      verificationStatus: 'succeeded',
      orderId: 'order-details-pending',
      entryIds: ['entry-1'],
      confirmationNumber: 'pi_details_pending',
    });
    entriesQueryMock.mockReturnValue(new Promise(() => {}));

    render(<CheckoutSuccessPage />, {
      initialRoute: '/checkout/success?session_id=cs_details_pending',
    });

    await finishVerificationTimers();

    expect(screen.getByText('pi_details_pending')).toBeInTheDocument();
    expect(resetCartMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status', { name: 'Verifying payment' })).not.toBeInTheDocument();
  });

  it('does not clear a different cart loaded after the verified checkout', async () => {
    cartState.cart = { id: 'cart-new' };
    verifyCheckoutSessionMock.mockResolvedValue({
      success: true,
      verificationStatus: 'succeeded',
      cartId: 'cart-paid',
      orderId: 'order-paid',
      entryIds: [],
      confirmationNumber: 'pi_cart_paid',
    });

    render(<CheckoutSuccessPage />, {
      initialRoute: '/checkout/success?session_id=cs_cart_paid',
    });

    await finishVerificationTimers();

    expect(screen.getByText('pi_cart_paid')).toBeInTheDocument();
    expect(resetCartMock).not.toHaveBeenCalled();
  });

  it('does not warn about another payment when no checkout session exists', async () => {
    render(<CheckoutSuccessPage />, {
      initialRoute: '/checkout/success',
    });

    await finishVerificationTimers();

    expect(screen.getByRole('heading', { name: 'Payment Status Unavailable' })).toBeInTheDocument();
    expect(screen.queryByText(/do not submit another payment/i)).not.toBeInTheDocument();
  });

  it('uses wait-list copy when a waitlist-only confirmation cannot be recovered', async () => {
    render(<CheckoutSuccessPage />, {
      initialRoute: '/checkout/success?waitlist=1&split=missing-summary',
    });

    await finishVerificationTimers();

    expect(
      screen.getByRole('heading', { name: 'Wait List Confirmation Unavailable' })
    ).toBeInTheDocument();
    expect(screen.getByText(/no payment was submitted/i)).toBeInTheDocument();
  });

  it('shows a refunded payment as settled without an unavailable recheck instruction', async () => {
    verifyCheckoutSessionMock.mockResolvedValue({
      success: false,
      verificationStatus: 'refunded',
      error: 'Your payment was refunded.',
    });

    render(<CheckoutSuccessPage />, {
      initialRoute: '/checkout/success?session_id=cs_refunded',
    });

    await finishVerificationTimers();

    expect(screen.getByRole('heading', { name: 'Payment Refunded' })).toBeInTheDocument();
    expect(screen.queryByText(/check this payment again/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check Payment Status' })).not.toBeInTheDocument();
  });

  it('checks the original session again without starting a new checkout', async () => {
    verifyCheckoutSessionMock.mockResolvedValue({
      success: false,
      verificationStatus: 'processing',
      error: 'Your payment is still processing.',
    });

    render(<CheckoutSuccessPage />, {
      initialRoute: '/checkout/success?session_id=cs_same_session',
    });

    await finishVerificationTimers();
    const callsBeforeRecheck = verifyCheckoutSessionMock.mock.calls.length;
    verifyCheckoutSessionMock.mockResolvedValueOnce({
      success: true,
      verificationStatus: 'succeeded',
      orderId: 'order-1',
      entryIds: [],
      confirmationNumber: 'pi_123',
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Check Payment Status' }));
    });

    expect(verifyCheckoutSessionMock).toHaveBeenCalledTimes(callsBeforeRecheck + 1);
    expect(verifyCheckoutSessionMock).toHaveBeenLastCalledWith('cs_same_session');
    expect(screen.getByText('pi_123')).toBeInTheDocument();
  });

  it('allows only one same-frame manual status check', async () => {
    verifyCheckoutSessionMock.mockResolvedValue({
      success: false,
      verificationStatus: 'processing',
      error: 'Your payment is still processing.',
    });

    render(<CheckoutSuccessPage />, {
      initialRoute: '/checkout/success?session_id=cs_manual_latch',
    });

    await finishVerificationTimers();
    const callsBeforeRecheck = verifyCheckoutSessionMock.mock.calls.length;
    verifyCheckoutSessionMock.mockReturnValue(new Promise(() => {}));
    const checkButton = screen.getByRole('button', { name: 'Check Payment Status' });

    fireEvent.click(checkButton);
    fireEvent.click(checkButton);

    expect(verifyCheckoutSessionMock).toHaveBeenCalledTimes(callsBeforeRecheck + 1);

    await finishVerificationTimers();
    expect(screen.getByRole('button', { name: 'Check Payment Status' })).toBeEnabled();
  });

  it('ignores a manual verification result after the page unmounts', async () => {
    verifyCheckoutSessionMock.mockResolvedValue({
      success: false,
      verificationStatus: 'processing',
      error: 'Your payment is still processing.',
    });

    const view = render(<CheckoutSuccessPage />, {
      initialRoute: '/checkout/success?session_id=cs_unmounted',
    });

    await finishVerificationTimers();
    let resolveVerification:
      | ((result: {
          success: true;
          verificationStatus: 'succeeded';
          orderId: string;
          entryIds: string[];
        }) => void)
      | undefined;
    verifyCheckoutSessionMock.mockReturnValueOnce(
      new Promise(resolve => {
        resolveVerification = resolve;
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Check Payment Status' }));
    view.unmount();

    await act(async () => {
      resolveVerification?.({
        success: true,
        verificationStatus: 'succeeded',
        orderId: 'order-too-late',
        entryIds: [],
      });
    });

    expect(resetCartMock).not.toHaveBeenCalled();
  });
});
