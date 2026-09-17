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
});

describe('withdrawal policy — ASCA', () => {
  it('has NO in-season reason: bitches in season may compete', () => {
    expect(codesFor('ASCA')).toEqual(['judge_change']);
    expect(getWithdrawalReason('ASCA', 'in_season')).toBeUndefined();
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

  it('labels the stored codes and rejects anything else', () => {
    expect(withdrawalReasonLabel('in_season')).toBe('Dog in season');
    expect(withdrawalReasonLabel('judge_change')).toBe('Judge change');
    expect(withdrawalReasonLabel('other')).toBeNull();
    expect(withdrawalReasonLabel(null)).toBeNull();
    expect(isWithdrawalReasonCode('in_season')).toBe(true);
    expect(isWithdrawalReasonCode('In-Season Dog')).toBe(false);
  });
});

describe('withdrawal copy states who decides, never an outcome', () => {
  // The app holds neither the premium nor the club's processing fee, and it
  // cannot evaluate the AKC 30-minute clock (classes.start_time is populated on
  // 1 of 35 live classes and there is no class date column). Any sentence naming
  // an amount is therefore a promise the secretary would have to break.
  const FORBIDDEN =
    /fully refunded|refunds in full|full refund|50%|will not be refunded|no refund/i;

  it('never promises an amount on any registry, for either act', () => {
    for (const registryId of listRegistries()) {
      const policy = getWithdrawalPolicy(registryId);
      expect(policy.withdrawRefundNote).not.toMatch(FORBIDDEN);
      expect(policy.pullRefundNote).not.toMatch(FORBIDDEN);
      for (const reason of policy.reasons) {
        expect(reason.documentationNote ?? '').not.toMatch(FORBIDDEN);
      }
    }
  });

  it('says the same thing about a withdrawal refund on every registry', () => {
    for (const registryId of listRegistries()) {
      expect(getWithdrawalPolicy(registryId).withdrawRefundNote).toBe(
        "Refund per the premium's rules; the show secretary confirms it."
      );
    }
  });
});
