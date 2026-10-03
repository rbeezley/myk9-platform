/**
 * MYK9-873: the ONE description of a payment link against the LIVE cart.
 *
 * Every combination Codex raised across both review rounds on #2685, as the pure
 * function sees it. `payable` is null when the orchestrator's lookup OR its
 * rebuild (upsert) failed; it never guesses an eligibility answer from a failure.
 */
import { describe, expect, it } from 'vitest';
import { describePaymentLinkOutcome, paymentLinkKey } from './cartStore.paymentLink';

const set = (...ids: string[]) => new Set(ids);

describe('describePaymentLinkOutcome', () => {
  it.each([
    {
      name: 'no cart shell, every linked entry unavailable',
      link: ['a', 'b'],
      payable: set(),
      final: [],
      expected: { kind: 'none-left', requested: 2, unavailable: 2, stillUnpaid: 0 },
    },
    {
      name: 'existing cart holding some linked entries (partial overlap)',
      link: ['a', 'b', 'c'],
      payable: set('a', 'b'),
      final: ['a'],
      expected: { kind: 'some-missing', requested: 3, unavailable: 1, stillUnpaid: 1 },
    },
    {
      name: 'cart emptied by reconciliation, then refilled with the unpaid link entry',
      link: ['paid', 'unpaid'],
      payable: set('unpaid'),
      final: ['unpaid'],
      expected: { kind: 'some-missing', requested: 2, unavailable: 1, stillUnpaid: 0 },
    },
    {
      name: 'cart emptied by reconciliation, link names only the unpaid entry, refilled',
      link: ['unpaid'],
      payable: set('unpaid'),
      final: ['unpaid'],
      expected: { kind: 'all-present', requested: 1, unavailable: 0, stillUnpaid: 0 },
    },
    {
      name: 'empty cart with a still-unpaid entry (last line removed, or refill could not add it)',
      link: ['unpaid'],
      payable: set('unpaid'),
      final: [],
      expected: { kind: 'none-left', requested: 1, unavailable: 0, stillUnpaid: 1 },
    },
    {
      name: 'empty cart (cleared) with still-unpaid and unavailable entries',
      link: ['a', 'b', 'paid'],
      payable: set('a', 'b'),
      final: [],
      expected: { kind: 'none-left', requested: 3, unavailable: 1, stillUnpaid: 2 },
    },
    {
      name: 'full match',
      link: ['a', 'b'],
      payable: set('a', 'b'),
      final: ['a', 'b'],
      expected: { kind: 'all-present', requested: 2, unavailable: 0, stillUnpaid: 0 },
    },
    {
      name: 'a cart of other new lines: the payable link entries are still owed',
      link: ['a'],
      payable: set('a'),
      final: [null, null],
      expected: { kind: 'some-missing', requested: 1, unavailable: 0, stillUnpaid: 1 },
    },
    {
      name: 'lookup failure',
      link: ['a', 'b'],
      payable: null,
      final: [],
      expected: { kind: 'failed', requested: 2, unavailable: 0, stillUnpaid: 0 },
    },
    {
      name: 'upsert failure (the rebuild failed after a good lookup)',
      link: ['a'],
      payable: null,
      final: [],
      expected: { kind: 'failed', requested: 1, unavailable: 0, stillUnpaid: 0 },
    },
    {
      name: 'duplicate ids in the link count once',
      link: ['a', 'a', ''],
      payable: set('a'),
      final: ['a'],
      expected: { kind: 'all-present', requested: 1, unavailable: 0, stillUnpaid: 0 },
    },
  ])('$name', ({ link, payable, final, expected }) => {
    expect(describePaymentLinkOutcome(link, payable, final)).toEqual(expected);
  });
});

describe('paymentLinkKey', () => {
  it('is the same for the same entries in any order, and null for none', () => {
    expect(paymentLinkKey(['b', 'a', 'a'])).toBe('a,b');
    expect(paymentLinkKey(['a', 'b'])).toBe('a,b');
    expect(paymentLinkKey([])).toBeNull();
    expect(paymentLinkKey([''])).toBeNull();
  });
});
