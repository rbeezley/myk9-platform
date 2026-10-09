/**
 * MYK9-1012 — a return from a Stripe page that expired with its hold says so.
 *
 * Pay holds the spots until the Stripe page expires. An exhibitor who comes
 * back after that instant did not "cancel": their hold ran out. The landing
 * says the cart is saved and that checking out again re-checks the spots; a
 * return before the hold ended keeps today's cancel landing.
 */

import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { rememberCheckoutHold } from '@/features/payments/checkoutHold';

const verifyCheckoutSessionMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/stripe', () => ({
  verifyCheckoutSession: verifyCheckoutSessionMock,
}));

vi.mock('@/store/cartStore', () => ({
  useCartStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ cart: { show_id: 'show-1' }, cartRecoveryInfo: { showId: 'show-1' } }),
  useCartItems: () => [],
}));

import CheckoutCancelPage from '@/pages/CheckoutCancelPage';

const HOLD_ENDED =
  'Your 30-minute hold ended. Your cart is saved; check out again to re-check spots.';

beforeEach(() => {
  verifyCheckoutSessionMock.mockResolvedValue({
    success: false,
    verificationStatus: 'not_found',
    error: 'not found',
  });
});

afterEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe('CheckoutCancelPage — the hold ended (MYK9-1012)', () => {
  it('says the hold ended and the cart is saved when the page outlived the hold', async () => {
    rememberCheckoutHold('cs_expired', new Date(Date.now() - 1000).toISOString());

    render(<CheckoutCancelPage />, { initialRoute: '/checkout/cancel?session_id=cs_expired' });

    expect(await screen.findByRole('heading', { name: 'Your hold ended' })).toBeInTheDocument();
    expect(screen.getByText(HOLD_ENDED)).toBeInTheDocument();
    expect(screen.queryByText(/payment cancelled/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /return to cart/i })).toBeInTheDocument();
  });

  // MYK9-1073: the help list under the message must not say the selections are
  // saved "for 30 minutes" when the page has just said those 30 minutes ended.
  it('does not tell a returning exhibitor their selections are saved for 30 minutes', async () => {
    rememberCheckoutHold('cs_expired', new Date(Date.now() - 1000).toISOString());

    render(<CheckoutCancelPage />, { initialRoute: '/checkout/cancel?session_id=cs_expired' });

    expect(await screen.findByRole('heading', { name: 'Your hold ended' })).toBeInTheDocument();
    expect(screen.queryByText(/saved for 30 minutes/i)).not.toBeInTheDocument();
    expect(screen.getByText('Your selections are saved')).toBeInTheDocument();
    expect(screen.getByText('You can return to checkout anytime')).toBeInTheDocument();
  });

  it('keeps the cancel landing while the hold still lives', async () => {
    rememberCheckoutHold('cs_live', new Date(Date.now() + 10 * 60 * 1000).toISOString());

    render(<CheckoutCancelPage />, { initialRoute: '/checkout/cancel?session_id=cs_live' });

    expect(await screen.findByRole('heading', { name: /payment cancelled/i })).toBeInTheDocument();
    expect(screen.queryByText(HOLD_ENDED)).not.toBeInTheDocument();
    // The live hold still lasts up to 30 minutes, so the original wording stays true.
    expect(screen.getByText('Your selections are saved for 30 minutes')).toBeInTheDocument();
  });

  it("does not blame an older page: only this session's hold counts", async () => {
    rememberCheckoutHold('cs_other', new Date(Date.now() - 1000).toISOString());

    render(<CheckoutCancelPage />, { initialRoute: '/checkout/cancel?session_id=cs_this' });

    expect(await screen.findByRole('heading', { name: /payment cancelled/i })).toBeInTheDocument();
    expect(screen.queryByText(HOLD_ENDED)).not.toBeInTheDocument();
  });
});
