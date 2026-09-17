/**
 * MYK9-632: the withdrawal rules are RULEBOOK facts, so each registry gets its
 * own case. A registry whose reason list is wrong offers an exhibitor a refund
 * their rulebook does not grant (or hides one it does).
 */
import { describe, it, expect } from 'vitest';
import {
  WITHDRAWAL_REASON_CODES,
  getWithdrawalPolicy,
  getWithdrawalReason,
  isPastWithdrawalCutoff,
  isWithdrawalReasonCode,
  withdrawalReasonLabel,
} from '../withdrawalPolicy';
import { listRegistries } from '../lookup';

const codesFor = (registryId: 'AKC' | 'UKC' | 'ASCA') =>
  getWithdrawalPolicy(registryId).reasons.map(reason => reason.code);

describe('withdrawal policy — AKC', () => {
  it('offers both reasons', () => {
    expect(codesFor('AKC')).toEqual(['in_season', 'judge_change']);
  });

  it('closes withdrawals 30 minutes before the first class of the day', () => {
    expect(getWithdrawalPolicy('AKC').cutoffMinutesBeforeFirstClass).toBe(30);
  });

  it('never promises "no refund" for a pull', () => {
    expect(getWithdrawalPolicy('AKC').pullRefundNote).toBe(
      "Refunds for a pull are at the club's discretion."
    );
  });
});

describe('withdrawal policy — UKC', () => {
  it('offers both reasons', () => {
    expect(codesFor('UKC')).toEqual(['in_season', 'judge_change']);
  });

  it('states the vet-certificate requirement on the in-season reason', () => {
    expect(getWithdrawalReason('UKC', 'in_season')?.documentationNote).toMatch(
      /veterinary certificate/i
    );
  });

  it('states the full-or-50% club option', () => {
    expect(getWithdrawalReason('UKC', 'in_season')?.refundNote).toMatch(/50%/);
  });

  it('states no clock cutoff', () => {
    expect(getWithdrawalPolicy('UKC').cutoffMinutesBeforeFirstClass).toBeNull();
  });
});

describe('withdrawal policy — ASCA', () => {
  it('has NO in-season reason: bitches in season may compete', () => {
    expect(codesFor('ASCA')).toEqual(['judge_change']);
    expect(getWithdrawalReason('ASCA', 'in_season')).toBeUndefined();
  });

  it('states no clock cutoff', () => {
    expect(getWithdrawalPolicy('ASCA').cutoffMinutesBeforeFirstClass).toBeNull();
  });
});

describe('withdrawal policy — platform invariants', () => {
  it('configures every registry the lookup knows about', () => {
    for (const registryId of listRegistries()) {
      expect(getWithdrawalPolicy(registryId).reasons.length).toBeGreaterThan(0);
    }
  });

  it('never offers a reason outside the two-value allow-list', () => {
    for (const registryId of listRegistries()) {
      for (const reason of getWithdrawalPolicy(registryId).reasons) {
        expect(WITHDRAWAL_REASON_CODES).toContain(reason.code);
      }
    }
  });

  it('no pull copy promises that the fee will not be refunded', () => {
    for (const registryId of listRegistries()) {
      expect(getWithdrawalPolicy(registryId).pullRefundNote).not.toMatch(/not be refunded/i);
    }
  });

  it('labels the stored codes and rejects anything else', () => {
    expect(withdrawalReasonLabel('in_season')).toBe('Dog in season');
    expect(withdrawalReasonLabel('judge_change')).toBe('Judge change');
    expect(withdrawalReasonLabel('other')).toBeNull();
    expect(withdrawalReasonLabel(null)).toBeNull();
    expect(isWithdrawalReasonCode('in_season')).toBe(true);
    expect(isWithdrawalReasonCode('In-Season Dog')).toBe(false);
  });
});

describe('isPastWithdrawalCutoff', () => {
  const start = new Date('2026-10-03T13:00:00Z');

  it('is false 31 minutes before an AKC first class', () => {
    expect(
      isPastWithdrawalCutoff({
        registryId: 'AKC',
        firstClassStartsAt: start,
        now: new Date('2026-10-03T12:29:00Z'),
      })
    ).toBe(false);
  });

  it('is true 29 minutes before an AKC first class', () => {
    expect(
      isPastWithdrawalCutoff({
        registryId: 'AKC',
        firstClassStartsAt: start,
        now: new Date('2026-10-03T12:31:00Z'),
      })
    ).toBe(true);
  });

  it('accepts an ISO string', () => {
    expect(
      isPastWithdrawalCutoff({
        registryId: 'AKC',
        firstClassStartsAt: start.toISOString(),
        now: new Date('2026-10-03T12:31:00Z'),
      })
    ).toBe(true);
  });

  // Fails OPEN on purpose: the server owns the refusal, and greying Withdraw out
  // on a guess would state a rule this registry may not have.
  it('is false for a registry with no cutoff, even after the class started', () => {
    expect(
      isPastWithdrawalCutoff({
        registryId: 'UKC',
        firstClassStartsAt: start,
        now: new Date('2026-10-03T18:00:00Z'),
      })
    ).toBe(false);
  });

  it('is false when the first class start time is unknown or unparseable', () => {
    expect(
      isPastWithdrawalCutoff({ registryId: 'AKC', firstClassStartsAt: null, now: new Date() })
    ).toBe(false);
    expect(isPastWithdrawalCutoff({ registryId: 'AKC', firstClassStartsAt: 'not a date' })).toBe(
      false
    );
  });
});
