import { describe, expect, it } from 'vitest';
import { splitCartItemsByJudgeDayCapacity } from './cartCapacitySplit';
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

function judgeDay(availableSpots: number, classIds: string[]): JudgeDayCapacity {
  return {
    judgeId: 'judge-1',
    judgeName: 'Judge Judy',
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

describe('splitCartItemsByJudgeDayCapacity', () => {
  it('consumes judge-day spots with the cart before deciding waitlist lines', () => {
    const result = splitCartItemsByJudgeDayCapacity(
      [item('first', 'class-a'), item('second', 'class-b')],
      [judgeDay(1, ['class-a', 'class-b'])]
    );

    expect(result.confirmedItemIds).toEqual(new Set(['first']));
    expect(result.waitlistItemIds).toEqual(new Set(['second']));
    expect(result.blockedItems).toEqual([]);
  });

  it('blocks the cart item that exceeds capacity when its class does not allow waitlist', () => {
    const denied = item('denied', 'class-b', false);

    const result = splitCartItemsByJudgeDayCapacity(
      [item('first', 'class-a'), denied],
      [judgeDay(1, ['class-a', 'class-b'])]
    );

    expect(result.confirmedItemIds).toEqual(new Set(['first']));
    expect(result.waitlistItemIds).toEqual(new Set());
    expect(result.blockedItems).toEqual([denied]);
  });

  it('blocks a class at its per-class limit even when judge-day capacity remains', () => {
    const result = splitCartItemsByJudgeDayCapacity(
      [item('limited', 'class-limited', false)],
      [judgeDay(5, ['class-limited'])],
      ['class-limited']
    );

    expect(result.confirmedItemIds).toEqual(new Set());
    expect(result.waitlistItemIds).toEqual(new Set());
    expect(result.blockedItems).toEqual([item('limited', 'class-limited', false)]);
  });
});
