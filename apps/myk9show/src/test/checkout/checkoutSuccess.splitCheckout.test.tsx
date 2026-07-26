import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { STORAGE_KEYS } from '@/constants/storageKeys';

const verifyCheckoutSessionMock = vi.hoisted(() => vi.fn());
const resetCartMock = vi.hoisted(() => vi.fn());
const entriesRows = vi.hoisted(() => ({ value: [] as unknown[] }));

vi.mock('@/lib/stripe', () => ({
  verifyCheckoutSession: verifyCheckoutSessionMock,
}));

vi.mock('@/store/cartStore', () => ({
  useCartStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      reset: resetCartMock,
    }),
}));

vi.mock('@/lib/supabase', () => {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    in: vi.fn(() => Promise.resolve({ data: entriesRows.value, error: null })),
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

describe('CheckoutSuccessPage split checkout summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    entriesRows.value = [];
  });

  it('uses a skeleton, not a spinner, while payment verification is pending', () => {
    verifyCheckoutSessionMock.mockReturnValue(new Promise(() => {}));

    render(<CheckoutSuccessPage />, {
      initialRoute: '/checkout/success?session_id=cs_test_loading',
    });

    expect(screen.getByRole('status', { name: 'Verifying payment' })).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeNull();
    expect(screen.queryByText('Verifying your payment...')).not.toBeInTheDocument();
  });

  it('shows the paid and waitlisted split after a mixed checkout returns from Stripe', async () => {
    sessionStorage.setItem(
      STORAGE_KEYS.CART_SPLIT_CHECKOUT,
      JSON.stringify({
        correlationId: 'split-1',
        showId: 'show-1',
        confirmedEntryCount: 1,
        waitlistEntries: [
          {
            id: 'wait-1',
            class_id: 'class-full',
            dog_id: 'dog-1',
            exhibitor_id: 'exhibitor-1',
            handler_id: null,
            position: 2,
            status: 'waiting',
            className: 'Full Class',
          },
        ],
      })
    );
    verifyCheckoutSessionMock.mockResolvedValue({
      success: true,
      orderId: 'order-1',
      showId: 'show-1',
      showName: 'Summer Show',
      totalAmountCents: 2500,
      entryIds: ['entry-1'],
      confirmationNumber: 'pi_123',
    });
    entriesRows.value = [
      {
        id: 'entry-1',
        armband: '101',
        dogs: { name: 'Scout', call_name: 'Scout' },
        classes: { name: 'Open Class', level: 'Novice' },
      },
    ];

    render(<CheckoutSuccessPage />, {
      initialRoute: '/checkout/success?session_id=cs_test_123&split=split-1',
    });

    await waitFor(() => expect(screen.getByText('pi_123')).toBeInTheDocument());
    expect(screen.getByText(/Paid: 1 entry/i)).toBeInTheDocument();
    expect(screen.getByText(/Waitlisted: 1 entry/i)).toBeInTheDocument();
    expect(screen.getByText(/Full Class #2/i)).toBeInTheDocument();
    expect(resetCartMock).toHaveBeenCalled();
    expect(sessionStorage.getItem(STORAGE_KEYS.CART_SPLIT_CHECKOUT)).toBeNull();
  });

  it('renders the existing success page as a waitlist-only confirmation', async () => {
    sessionStorage.setItem(
      STORAGE_KEYS.CART_SPLIT_CHECKOUT,
      JSON.stringify({
        correlationId: 'split-2',
        showId: 'show-1',
        confirmedEntryCount: 0,
        waitlistEntries: [
          {
            id: 'wait-1',
            class_id: 'class-full',
            dog_id: 'dog-1',
            exhibitor_id: 'exhibitor-1',
            handler_id: null,
            position: 2,
            status: 'waiting',
            className: 'Full Class',
          },
        ],
      })
    );

    render(<CheckoutSuccessPage />, {
      initialRoute: '/checkout/success?waitlist=1&split=split-2',
    });

    await waitFor(() => expect(screen.getByText('Added to Wait List')).toBeInTheDocument());
    expect(
      screen.getByText(/We'll notify you if a spot opens up from the wait list\./i)
    ).toBeInTheDocument();
    expect(screen.queryByText('Order Total')).not.toBeInTheDocument();
    expect(verifyCheckoutSessionMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(STORAGE_KEYS.CART_SPLIT_CHECKOUT)).toBeNull();
  });

  it('does not render stale same-show same-count waitlist data for a later Stripe return', async () => {
    sessionStorage.setItem(
      STORAGE_KEYS.CART_SPLIT_CHECKOUT,
      JSON.stringify({
        correlationId: 'split-stale',
        showId: 'show-1',
        confirmedEntryCount: 1,
        waitlistEntries: [
          {
            id: 'wait-stale',
            class_id: 'class-full',
            dog_id: 'dog-1',
            exhibitor_id: 'exhibitor-1',
            handler_id: null,
            position: 9,
            status: 'waiting',
            className: 'Old Full Class',
          },
        ],
      })
    );
    verifyCheckoutSessionMock.mockResolvedValue({
      success: true,
      orderId: 'order-2',
      showId: 'show-1',
      showName: 'Summer Show',
      totalAmountCents: 2500,
      entryIds: ['entry-1'],
      confirmationNumber: 'pi_456',
    });
    entriesRows.value = [
      {
        id: 'entry-1',
        armband: '102',
        dogs: { name: 'Scout', call_name: 'Scout' },
        classes: { name: 'Open Class', level: 'Novice' },
      },
    ];

    render(<CheckoutSuccessPage />, {
      initialRoute: '/checkout/success?session_id=cs_test_456&split=split-current',
    });

    await waitFor(() => expect(screen.getByText('pi_456')).toBeInTheDocument());
    expect(screen.queryByText(/Entry Summary:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Old Full Class #9/i)).not.toBeInTheDocument();
    expect(sessionStorage.getItem(STORAGE_KEYS.CART_SPLIT_CHECKOUT)).toContain('split-stale');
  });
});
