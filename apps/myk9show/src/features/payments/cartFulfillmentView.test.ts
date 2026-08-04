import { describe, expect, it } from 'vitest';
import { buildCartFulfillmentView } from './cartFulfillmentView';
import type { CartItemWithDetails } from '@/store/cartStore';
import type { JudgeDayCapacity } from '@/types/waitlist-types';

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

// judgeId + showDate is the capacity bucket key, so a fixture with two distinct
// days must vary one of them — otherwise both rows collide into one bucket.
function judgeDay(
  availableSpots: number,
  classIds: string[],
  judgeId = 'judge-1'
): JudgeDayCapacity {
  return {
    judgeId,
    judgeName: `Judge ${judgeId}`,
    showDate: '2026-09-01',
    capacity: 10,
    confirmedCount: 9,
    waitlistCount: 0,
    mailInReserved: 0,
    availableSpots,
    classIds,
    classNames: classIds,
  };
}

describe('buildCartFulfillmentView', () => {
  it('marks an open class payable and counts its fee toward the payable subtotal', () => {
    const open = item('item-open', 'class-open');

    const view = buildCartFulfillmentView([open], [judgeDay(5, ['class-open'])]);

    expect(view.fulfillmentByItemId['item-open']).toBe('payable');
    expect(view.payableItems).toEqual([open]);
    expect(view.waitlistItems).toEqual([]);
    expect(view.blockedItems).toEqual([]);
    expect(view.payableSubtotalCents).toBe(2500);
    expect(view.waitlistSubtotalCents).toBe(0);
  });

  it('marks a full class that accepts a wait list as a wait-list request, not a payable line', () => {
    const full = item('item-full', 'class-full');

    const view = buildCartFulfillmentView([full], [judgeDay(0, ['class-full'])]);

    expect(view.fulfillmentByItemId['item-full']).toBe('waitlist');
    expect(view.payableItems).toEqual([]);
    expect(view.waitlistItems).toEqual([full]);
    expect(view.payableSubtotalCents).toBe(0);
    expect(view.waitlistSubtotalCents).toBe(2500);
  });

  it('marks a full class that refuses a wait list as blocked', () => {
    const blocked = item('item-blocked', 'class-full', false);

    const view = buildCartFulfillmentView([blocked], [judgeDay(0, ['class-full'])]);

    expect(view.fulfillmentByItemId['item-blocked']).toBe('blocked');
    expect(view.blockedItems).toEqual([blocked]);
    expect(view.payableSubtotalCents).toBe(0);
    // A blocked line can never be paid for, so it contributes to neither total.
    expect(view.waitlistSubtotalCents).toBe(0);
  });

  it('keeps the payable subtotal to open classes when a cart mixes open and full', () => {
    const open = item('item-open', 'class-open');
    const full = item('item-full', 'class-full');

    const view = buildCartFulfillmentView(
      [open, full],
      [judgeDay(5, ['class-open']), judgeDay(0, ['class-full'], 'judge-2')]
    );

    expect(view.fulfillmentByItemId).toEqual({
      'item-open': 'payable',
      'item-full': 'waitlist',
    });
    expect(view.payableSubtotalCents).toBe(2500);
    expect(view.waitlistSubtotalCents).toBe(2500);
  });

  it('consumes remaining spots in cart order, waitlisting the overflow', () => {
    const first = item('item-1', 'class-open');
    const second = item('item-2', 'class-open');

    const view = buildCartFulfillmentView([first, second], [judgeDay(1, ['class-open'])]);

    expect(view.fulfillmentByItemId['item-1']).toBe('payable');
    expect(view.fulfillmentByItemId['item-2']).toBe('waitlist');
    expect(view.payableSubtotalCents).toBe(2500);
  });

  it('reports capacity as unknown while judge-day capacity has not resolved', () => {
    const open = item('item-open', 'class-open');

    const view = buildCartFulfillmentView([open], null);

    expect(view.capacityKnown).toBe(false);
    // Nothing may be claimed about availability yet, so no line is demoted to a
    // wait-list request on a guess. The caller gates checkout on capacityKnown.
    expect(view.fulfillmentByItemId['item-open']).toBe('payable');
    expect(view.payableSubtotalCents).toBe(2500);
  });

  it('reports capacity as known once judge days resolve, even when the show has none', () => {
    const open = item('item-open', 'class-open');

    const view = buildCartFulfillmentView([open], []);

    expect(view.capacityKnown).toBe(true);
    expect(view.fulfillmentByItemId['item-open']).toBe('payable');
  });

  it('returns an empty view for an empty cart', () => {
    const view = buildCartFulfillmentView([], [judgeDay(5, ['class-open'])]);

    expect(view.payableItems).toEqual([]);
    expect(view.waitlistItems).toEqual([]);
    expect(view.blockedItems).toEqual([]);
    expect(view.payableSubtotalCents).toBe(0);
    expect(view.waitlistSubtotalCents).toBe(0);
  });
});
