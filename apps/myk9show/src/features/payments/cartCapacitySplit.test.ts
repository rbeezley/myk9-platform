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
      [{ classId: 'class-limited', availableSpots: 0 }]
    );

    expect(result.confirmedItemIds).toEqual(new Set());
    expect(result.waitlistItemIds).toEqual(new Set());
    expect(result.blockedItems).toEqual([item('limited', 'class-limited', false)]);
  });

  it('keeps a recovered unpaid entry payable after its class fills', () => {
    const recovered = { ...item('recovered', 'class-limited', false), entry_id: 'entry-1' };

    const result = splitCartItemsByJudgeDayCapacity(
      [recovered],
      [judgeDay(0, ['class-limited'])],
      [{ classId: 'class-limited', availableSpots: 0 }]
    );

    expect(result.confirmedItemIds).toEqual(new Set(['recovered']));
    expect(result.waitlistItemIds).toEqual(new Set());
    expect(result.blockedItems).toEqual([]);
  });

  it('does not let a recovered entry consume an available spot from a judge day', () => {
    const recovered = { ...item('recovered', 'class-open', false), entry_id: 'entry-1' };
    const newItem = item('new', 'class-open', true);

    const result = splitCartItemsByJudgeDayCapacity(
      [recovered, newItem],
      [judgeDay(1, ['class-open'])]
    );

    expect(result.confirmedItemIds).toEqual(new Set(['recovered', 'new']));
    expect(result.waitlistItemIds).toEqual(new Set());
    expect(result.blockedItems).toEqual([]);
  });
});

// MYK9-753: the split reads every judge day a class runs on, with each day's
// real remaining spots from get_show_class_judge_day_availability.
describe('splitCartItemsByJudgeDayCapacity per judge day (MYK9-753)', () => {
  const day = (judgeId: string, availableSpots: number, classIds: string[]) => ({
    judgeId,
    showDate: '2026-10-10',
    availableSpots,
    classIds,
  });

  it('holds back the second of two lines on the same day when one spot is left', () => {
    const result = splitCartItemsByJudgeDayCapacity(
      [item('first', 'interior'), item('second', 'container', false)],
      [day('alma', 1, ['interior', 'container'])]
    );

    expect(result.confirmedItemIds).toEqual(new Set(['first']));
    expect(result.blockedItems.map(line => line.id)).toEqual(['second']);
    expect(result.fullReasonByItemId.get('second')).toEqual({
      kind: 'judge-day',
      judgeId: 'alma',
      showDate: '2026-10-10',
    });
  });

  it('lets lines on different judge days each use their own day', () => {
    const result = splitCartItemsByJudgeDayCapacity(
      [item('on-alma', 'interior', false), item('on-bert', 'exterior', false)],
      [day('alma', 1, ['interior']), day('bert', 1, ['exterior'])]
    );

    expect(result.confirmedItemIds).toEqual(new Set(['on-alma', 'on-bert']));
    expect(result.blockedItems).toEqual([]);
    expect(result.fullReasonByItemId.size).toBe(0);
  });

  it('blocks a two-judge line when one of its days is full, naming that day', () => {
    const result = splitCartItemsByJudgeDayCapacity(
      [item('two-judge', 'interior', false)],
      [day('alma', 0, ['interior']), day('bert', 3, ['interior'])]
    );

    expect(result.blockedItems.map(line => line.id)).toEqual(['two-judge']);
    expect(result.fullReasonByItemId.get('two-judge')).toEqual({
      kind: 'judge-day',
      judgeId: 'alma',
      showDate: '2026-10-10',
    });
  });

  it('charges a two-judge line against both days, so it can fill the other day', () => {
    const result = splitCartItemsByJudgeDayCapacity(
      [item('two-judge', 'interior'), item('bert-only', 'exterior')],
      [day('alma', 2, ['interior']), day('bert', 1, ['interior', 'exterior'])]
    );

    expect(result.confirmedItemIds).toEqual(new Set(['two-judge']));
    expect(result.waitlistItemIds).toEqual(new Set(['bert-only']));
    expect(result.fullReasonByItemId.get('bert-only')).toMatchObject({ judgeId: 'bert' });
  });

  it('counts cart lines against a class limit, and says the class is what is full', () => {
    const result = splitCartItemsByJudgeDayCapacity(
      [item('first', 'buried'), item('second', 'buried')],
      [],
      [{ classId: 'buried', availableSpots: 1 }]
    );

    expect(result.confirmedItemIds).toEqual(new Set(['first']));
    expect(result.waitlistItemIds).toEqual(new Set(['second']));
    expect(result.fullReasonByItemId.get('second')).toEqual({ kind: 'class' });
  });
});
