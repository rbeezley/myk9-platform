import { describe, expect, it } from 'vitest';
import {
  derivePullTiming,
  getSuggestedPullRefundDecision,
  isUnresolvedRemovalRefundDecision,
} from './pullReconciliation';

describe('derivePullTiming', () => {
  it('classifies a pull on the close day as before close in the trial timezone', () => {
    expect(
      derivePullTiming({
        pulledAt: '2026-07-11T03:30:00Z',
        entryCloseDate: '2026-07-10T00:00:00+00:00',
        timeZone: 'America/Chicago',
      })
    ).toBe('before_close');
  });

  it('classifies a pull after the close day as after close', () => {
    expect(
      derivePullTiming({
        pulledAt: '2026-07-11T05:30:00Z',
        entryCloseDate: '2026-07-10',
        timeZone: 'America/Chicago',
      })
    ).toBe('after_close');
  });

  it.each([
    { pulledAt: null, entryCloseDate: '2026-07-10' },
    { pulledAt: '2026-07-10T12:00:00Z', entryCloseDate: null },
    { pulledAt: 'not-a-date', entryCloseDate: '2026-07-10' },
  ])('returns unknown when timing inputs are incomplete', input => {
    expect(derivePullTiming({ ...input, timeZone: 'America/Chicago' })).toBeNull();
  });
});

describe('getSuggestedPullRefundDecision', () => {
  it('suggests refund before close, denial after close, and no choice when timing is unknown', () => {
    expect(getSuggestedPullRefundDecision('before_close')).toBe('refund');
    expect(getSuggestedPullRefundDecision('after_close')).toBe('denied');
    expect(getSuggestedPullRefundDecision(null)).toBeNull();
  });
});

describe('isUnresolvedRemovalRefundDecision', () => {
  const pulledPaidEntry = {
    entry_status: 'scratched',
    payment_method: 'online',
    payment_status: 'paid',
    refund_amount: null,
    refund_decision: null,
  };

  it('flags only paid online pulls with neither a refund nor an explicit denial', () => {
    expect(isUnresolvedRemovalRefundDecision(pulledPaidEntry)).toBe(true);
    expect(
      isUnresolvedRemovalRefundDecision({ ...pulledPaidEntry, refund_decision: 'denied' })
    ).toBe(false);
    expect(isUnresolvedRemovalRefundDecision({ ...pulledPaidEntry, refund_amount: 25 })).toBe(
      false
    );
    expect(
      isUnresolvedRemovalRefundDecision({ ...pulledPaidEntry, entry_status: 'confirmed' })
    ).toBe(false);
  });

  // MYK9-632: a paid entry can now be WITHDRAWN, and that withdrawal owes the
  // secretary a decision under the premium's rules. If it does not reach this
  // queue there is no surface anywhere that can resolve it.
  it('flags a paid online WITHDRAWAL that carries a recognised reason code', () => {
    for (const withdrawal_reason_code of ['in_season', 'judge_change']) {
      expect(
        isUnresolvedRemovalRefundDecision({
          ...pulledPaidEntry,
          entry_status: 'withdrawn',
          withdrawal_reason_code,
        }),
        withdrawal_reason_code
      ).toBe(true);
    }
  });

  // The discriminator matters: every secretary removal lands in 'withdrawn' too
  // (rejectEntry, bulk status changes, every pre-MYK9-632 row). Sweeping those
  // in would invent a refund obligation nobody agreed to.
  it('ignores a withdrawn row with no reason code, or an unrecognised one', () => {
    expect(
      isUnresolvedRemovalRefundDecision({ ...pulledPaidEntry, entry_status: 'withdrawn' })
    ).toBe(false);
    expect(
      isUnresolvedRemovalRefundDecision({
        ...pulledPaidEntry,
        entry_status: 'withdrawn',
        withdrawal_reason_code: null,
      })
    ).toBe(false);
    expect(
      isUnresolvedRemovalRefundDecision({
        ...pulledPaidEntry,
        entry_status: 'withdrawn',
        withdrawal_reason_code: 'other',
      })
    ).toBe(false);
  });

  it('still requires paid-online and an unresolved decision for a withdrawal', () => {
    const withdrawn = {
      ...pulledPaidEntry,
      entry_status: 'withdrawn',
      withdrawal_reason_code: 'in_season',
    };
    expect(isUnresolvedRemovalRefundDecision({ ...withdrawn, payment_method: null })).toBe(false);
    expect(isUnresolvedRemovalRefundDecision({ ...withdrawn, payment_status: 'pending' })).toBe(
      false
    );
    expect(isUnresolvedRemovalRefundDecision({ ...withdrawn, refund_decision: 'denied' })).toBe(
      false
    );
    expect(isUnresolvedRemovalRefundDecision({ ...withdrawn, refund_amount: 25 })).toBe(false);
  });
});
