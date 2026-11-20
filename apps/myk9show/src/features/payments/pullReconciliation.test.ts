import { describe, expect, it } from 'vitest';
import {
  derivePullTiming,
  getSuggestedPullRefundDecision,
  isUnresolvedRemovalRefundDecision,
  refundToDecideRemoval,
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

  // MYK9-2099, owner decision 2026-11-16: a paid secretary removal (withdrawn, no
  // reason code) and a paid no-show (absent) also wait for a refund decision.
  it('flags a paid online secretary removal and a paid online no-show', () => {
    expect(
      isUnresolvedRemovalRefundDecision({ ...pulledPaidEntry, entry_status: 'withdrawn' })
    ).toBe(true);
    expect(
      isUnresolvedRemovalRefundDecision({
        ...pulledPaidEntry,
        entry_status: 'withdrawn',
        withdrawal_reason_code: null,
      })
    ).toBe(true);
    expect(isUnresolvedRemovalRefundDecision({ ...pulledPaidEntry, entry_status: 'absent' })).toBe(
      true
    );
    expect(
      isUnresolvedRemovalRefundDecision({
        ...pulledPaidEntry,
        entry_status: 'absent',
        refund_decision: 'denied',
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

describe('refundToDecideRemoval (MYK9-2099: the one definition)', () => {
  const paidOnline = {
    payment_method: 'online',
    payment_status: 'paid',
    refund_amount: null,
    refunded_at: null,
    refund_decision: null,
  };

  it('names every removal kind that waits for a decision', () => {
    expect(refundToDecideRemoval({ ...paidOnline, entry_status: 'scratched' })).toBe('pulled');
    expect(
      refundToDecideRemoval({
        ...paidOnline,
        entry_status: 'withdrawn',
        withdrawal_reason_code: 'judge_change',
      })
    ).toBe('withdrawn');
    expect(refundToDecideRemoval({ ...paidOnline, entry_status: 'withdrawn' })).toBe('removed');
    expect(refundToDecideRemoval({ ...paidOnline, entry_status: 'absent' })).toBe('absent');
  });

  it('drops a removal once it is denied or refunded', () => {
    for (const entry_status of ['scratched', 'withdrawn', 'absent']) {
      const row = { ...paidOnline, entry_status };
      expect(refundToDecideRemoval({ ...row, refund_decision: 'denied' }), entry_status).toBeNull();
      expect(refundToDecideRemoval({ ...row, refund_amount: 25 }), entry_status).toBeNull();
      expect(refundToDecideRemoval({ ...row, refund_amount: '25.00' }), entry_status).toBeNull();
      expect(
        refundToDecideRemoval({ ...row, refunded_at: '2026-11-17T12:00:00Z' }),
        entry_status
      ).toBeNull();
      expect(
        refundToDecideRemoval({ ...row, payment_status: 'refunded' }),
        entry_status
      ).toBeNull();
    }
  });

  it('needs a card payment to decide, and a removal recorded on the entry', () => {
    expect(
      refundToDecideRemoval({ ...paidOnline, entry_status: 'absent', payment_method: 'cash' })
    ).toBeNull();
    expect(
      refundToDecideRemoval({ ...paidOnline, entry_status: 'absent', payment_status: 'pending' })
    ).toBeNull();
    expect(refundToDecideRemoval({ ...paidOnline, entry_status: 'confirmed' })).toBeNull();
    expect(refundToDecideRemoval({ ...paidOnline, entry_status: null })).toBeNull();
  });
});

describe('refundToDecideRemoval and a refund the club paid directly (MYK9-2303)', () => {
  const removal = {
    entry_status: 'absent',
    payment_method: 'online',
    payment_status: 'paid',
    refund_amount: null,
    refunded_at: null,
    refund_decision: null,
  };

  it('is decided once the club has paid something back, and reopens at zero', () => {
    expect(refundToDecideRemoval({ ...removal, club_refunded_amount: 10 })).toBeNull();
    expect(refundToDecideRemoval({ ...removal, club_refunded_amount: '10.00' })).toBeNull();
    expect(refundToDecideRemoval({ ...removal, club_refunded_amount: 0 })).toBe('absent');
    expect(refundToDecideRemoval({ ...removal, club_refunded_amount: null })).toBe('absent');
    expect(refundToDecideRemoval(removal)).toBe('absent');
  });

  it('is decided for the payout ledger count too', () => {
    expect(isUnresolvedRemovalRefundDecision({ ...removal, club_refunded_amount: 10 })).toBe(false);
    expect(isUnresolvedRemovalRefundDecision({ ...removal, club_refunded_amount: 0 })).toBe(true);
  });
});
