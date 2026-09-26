import { describe, expect, it } from 'vitest';
import { describeBlockedCheckout, describeCartFullReason } from './cartFullReasonCopy';
import type { CartItemWithDetails } from '@/store/cartStore';
import type { CartFullReason } from './cartCapacitySplit';

const almaDay = { kind: 'judge-day', judgeId: 'alma', showDate: '2026-10-10' } as const;

describe('describeCartFullReason', () => {
  it('names the judge and the day that is full', () => {
    expect(describeCartFullReason(almaDay, new Map([['alma', 'Alma Judge']]))).toBe(
      "Alma Judge's judging day on Saturday, Oct 10 has no spots left right now."
    );
  });

  it('still names the day when the judge name is unknown', () => {
    expect(describeCartFullReason(almaDay)).toBe(
      "One judge's day on Saturday, Oct 10 has no spots left right now."
    );
  });

  it('says the class when the class limit is what is full', () => {
    expect(describeCartFullReason({ kind: 'class' })).toBe(
      'This class has no spots left right now.'
    );
  });
});

describe('describeBlockedCheckout', () => {
  const blocked = (id: string, name: string) =>
    ({ id, class: { name } }) as unknown as CartItemWithDetails;

  it('lists each blocked line with what is full, then the action', () => {
    expect(
      describeBlockedCheckout(
        [blocked('a', 'Interior Novice A'), blocked('b', 'Buried Novice A')],
        new Map<string, CartFullReason>([
          ['a', almaDay],
          ['b', { kind: 'class' }],
        ]),
        new Map([['alma', 'Alma Judge']])
      )
    ).toBe(
      "Interior Novice A: Alma Judge's judging day on Saturday, Oct 10 has no spots left right now. " +
        'Buried Novice A: This class has no spots left right now. ' +
        'They are not accepting wait list entries. Remove them to continue.'
    );
  });
});
