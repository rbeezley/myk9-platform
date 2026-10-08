/**
 * MYK9-1012 — the Pay step says the spots are held while the exhibitor pays.
 *
 * Pay holds every payable line's spot until the Stripe page expires. The one
 * line saying so appears only where the button charges for spots: never on a
 * wait-list-only cart, a blocked cart, or while availability is unknown.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { CartSummary } from './CartSummary';
import { buildCartFulfillmentView } from '@/features/payments/cartFulfillmentView';
import type {
  CartClassCapacity,
  CartJudgeDayCapacity,
} from '@/features/payments/cartCapacitySplit';
import { serverWaitlistClassIds, type CartTestLine } from '@/test/utils/cartWaitlistFixtures';
import type { JudgeDayCapacity } from '@/types/waitlist-types';

const PAY_LINE = "We're holding your spots for 30 minutes while you pay.";
const FAR_FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();

const storeState = { itemCount: 1, totalEntryFees: 2500 };

vi.mock('@/store/cartStore', () => ({
  useCartStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      cart: {
        id: 'cart-1',
        exhibitor_id: 'ex-1',
        show_id: 'show-1',
        status: 'active',
        expires_at: FAR_FUTURE,
        show: {
          id: 'show-1',
          name: 'Heartland Scent Work Classic',
          start_date: '2027-08-01',
          entry_close_date: '2027-06-30',
        },
      },
      getTotalEntryFees: () => storeState.totalEntryFees,
      getItemCount: () => storeState.itemCount,
      extendExpiration: vi.fn().mockResolvedValue(true),
    }),
}));

function item(id: string, classId: string, allowWaitlist = true): CartTestLine {
  return {
    id,
    cart_id: 'cart-1',
    class_id: classId,
    dog_id: `dog-${id}`,
    handler_id: null,
    entry_fee_cents: 2500,
    jump_height: null,
    special_requests: null,
    junior_fee_declared: false,
    created_at: '2026-06-28T00:00:00.000Z',
    class: {
      id: classId,
      name: classId,
      level: null,
      trial_id: 'trial-1',
    },
    serverTakesWaitlist: allowWaitlist,
  };
}

/** The cart view, told which classes take a wait list the way the server's read reports them. */
function view(
  lines: CartTestLine[],
  days: readonly CartJudgeDayCapacity[] | null,
  spots: readonly CartClassCapacity[] = []
) {
  return buildCartFulfillmentView(lines, days, spots, serverWaitlistClassIds(lines));
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
    confirmedCount: 10 - availableSpots,
    waitlistCount: 0,
    mailInReserved: 0,
    availableSpots,
    classIds,
    classNames: classIds,
  };
}

beforeEach(() => {
  storeState.itemCount = 1;
  storeState.totalEntryFees = 2500;
});

describe('CartSummary — the hold line at Pay (MYK9-1012)', () => {
  it('says the spots are held for 30 minutes under a live Pay button', () => {
    const fulfillment = view([item('item-open', 'class-open')], [judgeDay(5, ['class-open'])]);
    render(<CartSummary onCheckout={() => {}} fulfillment={fulfillment} />);

    expect(screen.getByRole('button', { name: /pay \$/i })).toBeEnabled();
    expect(screen.getByText(PAY_LINE)).toBeInTheDocument();
  });

  it('says nothing about holding on a wait-list-only cart: no spot is bought', () => {
    const fulfillment = view([item('item-full', 'class-full')], [judgeDay(0, ['class-full'])]);
    render(<CartSummary onCheckout={() => {}} fulfillment={fulfillment} />);

    expect(screen.getByRole('button', { name: /join the wait list/i })).toBeEnabled();
    expect(screen.queryByText(PAY_LINE)).not.toBeInTheDocument();
  });

  it('says nothing about holding when a full class blocks checkout', () => {
    const fulfillment = view(
      [item('item-blocked', 'class-full', false)],
      [judgeDay(0, ['class-full'])]
    );
    render(<CartSummary onCheckout={() => {}} fulfillment={fulfillment} />);

    expect(screen.queryByText(PAY_LINE)).not.toBeInTheDocument();
  });

  it('says nothing about holding while availability is unknown', () => {
    const fulfillment = view([item('item-open', 'class-open')], null);
    render(<CartSummary onCheckout={() => {}} fulfillment={fulfillment} />);

    expect(screen.queryByText(PAY_LINE)).not.toBeInTheDocument();
  });
});
