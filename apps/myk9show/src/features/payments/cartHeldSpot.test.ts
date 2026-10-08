/**
 * MYK9-1012, owner decision 2026-10-05: a spot another exhibitor holds at Pay
 * never removes this exhibitor's saved line. The server keeps the line in the
 * cart (the reconcile decides on entries alone) and the cart's own read counts
 * the hold, so the line reads full and is not payable; when the hold ends the
 * next read reports room and the line is payable again. Nothing here may
 * mention a hold: only the payer is ever told about holds.
 */
import { describe, expect, it } from 'vitest';
import type { CartItemWithDetails } from '@/store/cartStore';
import {
  cartCapacityFromJudgeDays,
  type ClassJudgeDayAvailabilityRow,
} from './cartCapacityFromJudgeDays';
import { buildCartFulfillmentView } from './cartFulfillmentView';
import { describeBlockedCheckout, describeCartFullReason } from './cartFullReasonCopy';

const HOLD_WORDING = /\bhold|\bheld/i;

function line(): CartItemWithDetails {
  return {
    id: 'item-bea',
    cart_id: 'cart-bea',
    class_id: 'class-c1',
    dog_id: 'dog-bea',
    handler_id: null,
    entry_fee_cents: 3000,
    jump_height: null,
    special_requests: null,
    junior_fee_declared: false,
    created_at: '2026-10-05T00:00:00.000Z',
    class: {
      id: 'class-c1',
      name: 'Novice Container',
      level: 'Novice',
      trial_id: 'trial-1',
    },
  };
}

// The server's cart read for a one-spot class with no judge, as Bea sees it.
function c1Row(remaining: number, allowWaitlist: boolean): ClassJudgeDayAvailabilityRow {
  return {
    class_id: 'class-c1',
    class_max_entries: 1,
    class_entry_count: 1 - remaining,
    class_remaining: remaining,
    class_full: remaining === 0,
    allow_waitlist: allowWaitlist,
    self_service_block: null,
    judge_id: null,
    show_date: null,
    day_capacity: null,
    day_taken: null,
    day_mail_in_reserved: null,
    day_remaining: null,
  } as ClassJudgeDayAvailabilityRow;
}

function viewFor(allowWaitlist: boolean, remaining: number) {
  const facts = cartCapacityFromJudgeDays([c1Row(remaining, allowWaitlist)]);
  return buildCartFulfillmentView(
    [line()],
    facts.judgeDays,
    facts.classSpots,
    facts.waitlistClassIds
  );
}

describe("another exhibitor's held spot (owner 2026-10-05)", () => {
  it('keeps the line, read full right now and not payable, when the class takes no wait list', () => {
    const view = viewFor(false, 0);

    expect(view.fulfillmentByItemId['item-bea']).toBe('blocked');
    expect(view.payableItems).toHaveLength(0);
    const copy = describeBlockedCheckout(view.blockedItems, view.fullReasonByItemId);
    expect(copy).toBe(
      'Novice Container: This class has no spots left right now. It is not accepting wait list entries. Remove it to continue.'
    );
    expect(copy).not.toMatch(HOLD_WORDING);
    expect(describeCartFullReason(view.fullReasonByItemId.get('item-bea'))).not.toMatch(
      HOLD_WORDING
    );
  });

  it('offers the usual wait list when the class has one, never charging for it', () => {
    const view = viewFor(true, 0);

    expect(view.fulfillmentByItemId['item-bea']).toBe('waitlist');
    expect(view.payableItems).toHaveLength(0);
  });

  it('is payable again on the next read once the hold has ended', () => {
    const view = viewFor(false, 1);

    expect(view.fulfillmentByItemId['item-bea']).toBe('payable');
    expect(view.payableItems).toHaveLength(1);
  });
});
