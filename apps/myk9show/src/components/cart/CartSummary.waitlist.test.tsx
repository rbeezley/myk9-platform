/**
 * CartSummary — wait-list lines are never payable lines (MYK9-122).
 *
 * The exhibitor UX walk (EUX-2026-07-30-01) found a full "join wait list" class
 * sitting in the cart as an ordinary payable entry: it moved the total, and then
 * vanished once checkout routed it to the wait list. These assertions pin the
 * contract — a wait-list request is disclosed separately and contributes $0 to
 * the amount charged, and a class that refuses a wait list blocks checkout with
 * a plain-language next action instead of failing on the button press.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { CartSummary } from './CartSummary';
import { buildCartFulfillmentView } from '@/features/payments/cartFulfillmentView';
import type { CartItemWithDetails } from '@/store/cartStore';
import type { JudgeDayCapacity } from '@/types/waitlist-types';

const FAR_FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();

const storeState = {
  cart: null as unknown,
  itemCount: 0,
  totalEntryFees: 0,
};

vi.mock('@/store/cartStore', () => ({
  useCartStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      cart: storeState.cart,
      getTotalEntryFees: () => storeState.totalEntryFees,
      getItemCount: () => storeState.itemCount,
      extendExpiration: vi.fn().mockResolvedValue(true),
    }),
}));

function cart() {
  return {
    id: 'cart-1',
    exhibitor_id: 'ex-1',
    show_id: 'show-1',
    status: 'active',
    expires_at: FAR_FUTURE,
    show: {
      id: 'show-1',
      name: 'Heartland Scent Work Classic',
      start_date: '2027-08-01',
      // Far future so the entries-closed gate never fires in these cases.
      entry_close_date: '2027-06-30',
    },
  };
}

function item(id: string, classId: string, allowWaitlist = true): CartItemWithDetails {
  return {
    id,
    cart_id: 'cart-1',
    class_id: classId,
    dog_id: `dog-${id}`,
    handler_id: null,
    entry_fee_cents: 2500,
    jump_height: null,
    special_requests: null,
    created_at: '2026-06-28T00:00:00.000Z',
    class: {
      id: classId,
      name: classId,
      level: null,
      trial_id: 'trial-1',
      allow_waitlist: allowWaitlist,
    },
  };
}

function judgeDay(
  availableSpots: number,
  classIds: string[],
  judgeId = 'judge-1'
): JudgeDayCapacity {
  return {
    judgeId,
    judgeName: `Judge ${judgeId}`,
    showDate: '2027-09-01',
    capacity: 10,
    confirmedCount: 9,
    waitlistCount: 0,
    mailInReserved: 0,
    availableSpots,
    classIds,
    classNames: classIds,
  };
}

beforeEach(() => {
  storeState.cart = cart();
  storeState.itemCount = 2;
  // The store still holds BOTH fees — the point of the fix is that the summary
  // no longer bills from this number when a line will not be charged.
  storeState.totalEntryFees = 5000;
});

describe('CartSummary — wait-list lines', () => {
  it('keeps a full class out of the payable subtotal and discloses it separately', () => {
    const open = item('item-open', 'class-open');
    const full = item('item-full', 'class-full');
    const fulfillment = buildCartFulfillmentView(
      [open, full],
      [judgeDay(5, ['class-open']), judgeDay(0, ['class-full'], 'judge-2')]
    );

    render(<CartSummary fulfillment={fulfillment} />);

    expect(screen.getByText('Entry Fees (1 entry)')).toBeInTheDocument();
    expect(screen.getByText('$25.00')).toBeInTheDocument();
    // $50.00 would mean the wait-list fee was billed as an ordinary entry.
    expect(screen.queryByText('$50.00')).not.toBeInTheDocument();
    expect(screen.getByText('Wait list requests (1)')).toBeInTheDocument();
    expect(screen.getByText('Availability checked at submission')).toBeInTheDocument();
  });

  it('names the wait-list requests on the pay button so the split is not a surprise', () => {
    const open = item('item-open', 'class-open');
    const full = item('item-full', 'class-full');
    const fulfillment = buildCartFulfillmentView(
      [open, full],
      [judgeDay(5, ['class-open']), judgeDay(0, ['class-full'], 'judge-2')]
    );

    render(<CartSummary fulfillment={fulfillment} />);

    const payButton = screen.getByRole('button', { name: /1 wait list request/i });
    expect(payButton).toBeEnabled();
  });

  it('offers a wait-list-only cart a wait-list action rather than a pay button', () => {
    const full = item('item-full', 'class-full');
    storeState.itemCount = 1;
    storeState.totalEntryFees = 2500;
    const fulfillment = buildCartFulfillmentView([full], [judgeDay(0, ['class-full'])]);

    render(<CartSummary fulfillment={fulfillment} />);

    const button = screen.getByRole('button', { name: /join the wait list/i });
    expect(button).toBeEnabled();
    expect(button).not.toHaveTextContent(/no payment due/i);
  });

  it('blocks checkout with the next action when a full class refuses a wait list', () => {
    const blocked = item('item-blocked', 'class-full', false);
    storeState.itemCount = 1;
    storeState.totalEntryFees = 2500;
    const fulfillment = buildCartFulfillmentView([blocked], [judgeDay(0, ['class-full'])]);

    render(<CartSummary fulfillment={fulfillment} />);

    expect(
      screen.getByText('A class is full and not accepting wait list entries')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Remove it from your cart to continue to payment.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /remove the full class to continue/i })
    ).toBeDisabled();
  });

  it('holds checkout while class availability is still unknown', () => {
    const open = item('item-open', 'class-open');
    storeState.itemCount = 1;
    storeState.totalEntryFees = 2500;
    const fulfillment = buildCartFulfillmentView([open], null);

    render(<CartSummary fulfillment={fulfillment} />);

    expect(screen.getByRole('button', { name: /checking class availability/i })).toBeDisabled();
    // The figure must not read as a settled amount due while it could still drop.
    expect(screen.getByText('Total (pending)')).toBeInTheDocument();
    expect(screen.queryByText('Total')).not.toBeInTheDocument();
    expect(
      screen.getByText(/this amount will drop if a class turns out to be full/i)
    ).toBeInTheDocument();
  });

  it('does not leave checkout on a spinner label when availability cannot be loaded', () => {
    const open = item('item-open', 'class-open');
    storeState.itemCount = 1;
    storeState.totalEntryFees = 2500;
    const fulfillment = buildCartFulfillmentView([open], null);

    render(<CartSummary fulfillment={fulfillment} capacityUnavailable />);

    const button = screen.getByRole('button', { name: /class availability unavailable/i });
    expect(button).toBeDisabled();
    expect(screen.queryByText(/checking class availability/i)).not.toBeInTheDocument();
    expect(screen.getByText('Total (pending)')).toBeInTheDocument();
    expect(
      screen.getByText(/we could not check which classes are still open/i)
    ).toBeInTheDocument();
  });

  it('totals every line when no fulfillment context is supplied', () => {
    render(<CartSummary />);

    expect(screen.getByText('Entry Fees (2 entries)')).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
    expect(screen.queryByText(/wait list requests/i)).not.toBeInTheDocument();
  });
});
