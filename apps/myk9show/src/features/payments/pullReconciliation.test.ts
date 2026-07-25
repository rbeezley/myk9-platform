import { describe, expect, it } from 'vitest';
import {
  derivePullTiming,
  getSuggestedPullRefundDecision,
  isUnresolvedPullRefundDecision,
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

describe('isUnresolvedPullRefundDecision', () => {
  const pulledPaidEntry = {
    entry_status: 'scratched',
    payment_method: 'online',
    payment_status: 'paid',
    refund_amount: null,
    refund_decision: null,
  };

  it('flags only paid online pulls with neither a refund nor an explicit denial', () => {
    expect(isUnresolvedPullRefundDecision(pulledPaidEntry)).toBe(true);
    expect(isUnresolvedPullRefundDecision({ ...pulledPaidEntry, refund_decision: 'denied' })).toBe(
      false
    );
    expect(isUnresolvedPullRefundDecision({ ...pulledPaidEntry, refund_amount: 25 })).toBe(false);
    expect(isUnresolvedPullRefundDecision({ ...pulledPaidEntry, entry_status: 'confirmed' })).toBe(
      false
    );
  });
});
