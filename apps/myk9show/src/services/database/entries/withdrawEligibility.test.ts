/**
 * MYK9-535: the withdraw predicate is the one place the UI affordance, the
 * client pre-check and the RPC's owner-tier guards agree. These pin the exact
 * id/status SHAPES the app emits, and the refusal ORDER, which must match
 * `20260915203300_withdraw_own_entry_rpc.sql`.
 */
import { describe, expect, it } from 'vitest';
import {
  evaluateWithdrawEligibility,
  OWNER_WITHDRAWABLE_ENTRY_STATUSES,
  PRE_SHOW_CHECK_IN_STATUSES,
  WithdrawNotAllowedError,
} from './withdrawEligibility';

const pending = {
  entryStatus: 'confirmed',
  paymentStatus: 'pending',
  checkInStatus: 'no-status',
  isInRing: false,
  isScored: false,
  deletedAt: null,
};

describe('evaluateWithdrawEligibility', () => {
  it('allows an unpaid, pre-show entry', () => {
    expect(evaluateWithdrawEligibility(pending)).toEqual({ allowed: true });
  });

  it('allows every status the migration lists as withdrawable', () => {
    for (const entryStatus of OWNER_WITHDRAWABLE_ENTRY_STATUSES) {
      expect(evaluateWithdrawEligibility({ ...pending, entryStatus }).allowed).toBe(true);
    }
  });

  it('refuses a paid entry and names the refund path', () => {
    const result = evaluateWithdrawEligibility({ ...pending, paymentStatus: 'paid' });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('paid');
    expect(result.reason).toContain('refund');
  });

  it('refuses a refunded entry', () => {
    expect(evaluateWithdrawEligibility({ ...pending, paymentStatus: 'refunded' }).code).toBe(
      'paid'
    );
  });

  it('treats a waived entry as unpaid, matching the RPC', () => {
    expect(evaluateWithdrawEligibility({ ...pending, paymentStatus: 'waived' }).allowed).toBe(true);
  });

  it('keeps an unpaid entry withdrawable when only the ORDER reads paid (MYK9-495)', () => {
    // The order row is reused per (show, handler), so its `paid` cannot vouch
    // for THIS entry. resolveEffectivePaymentStatus resolves the pair to pending.
    const result = evaluateWithdrawEligibility({
      ...pending,
      paymentStatus: 'pending',
      enrollmentPaymentStatus: 'paid',
    });
    expect(result.allowed).toBe(true);
  });

  it('refuses a checked-in or in-ring entry — the day-of self-withdrawal hole', () => {
    // self_checkin_entry writes ONLY check_in_status, leaving entry_status
    // 'confirmed', so without this guard every other check passes at the gate.
    for (const checkInStatus of ['checked-in', 'at-gate', 'come-to-gate', 'in-ring', 'conflict']) {
      const result = evaluateWithdrawEligibility({ ...pending, checkInStatus });
      expect(result.allowed, checkInStatus).toBe(false);
      expect(result.code, checkInStatus).toBe('at-show');
    }
    expect(evaluateWithdrawEligibility({ ...pending, isInRing: true }).code).toBe('at-show');
  });

  it('allows only the two pre-show check-in values, so a new DB value fails closed', () => {
    for (const checkInStatus of PRE_SHOW_CHECK_IN_STATUSES) {
      expect(evaluateWithdrawEligibility({ ...pending, checkInStatus }).allowed).toBe(true);
    }
    expect(evaluateWithdrawEligibility({ ...pending, checkInStatus: 'a-new-value' }).code).toBe(
      'at-show'
    );
  });

  it('refuses when the payment status cannot be determined — FAIL CLOSED', () => {
    // The RPC refuses unless payment_status IS 'pending' or 'waived', so an
    // unknown status must refuse here too rather than offering a withdrawal the
    // server will reject.
    const result = evaluateWithdrawEligibility({ ...pending, paymentStatus: null });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('unknown-payment');
  });

  it('allows a secretary-decision request status, in BOTH DB spellings', () => {
    // entries_entry_status_check admits both; the live column holds the
    // hyphenated form. An unpaid exhibitor awaiting a decision must still be
    // able to withdraw.
    for (const entryStatus of [
      'move-up-requested',
      'move_up_requested',
      'scratch-requested',
      'scratch_requested',
    ]) {
      expect(evaluateWithdrawEligibility({ ...pending, entryStatus }).allowed, entryStatus).toBe(
        true
      );
    }
  });

  it('refuses a scored, removed, or terminal-status entry', () => {
    expect(evaluateWithdrawEligibility({ ...pending, isScored: true }).code).toBe('scored');
    expect(evaluateWithdrawEligibility({ ...pending, deletedAt: '2026-09-15' }).code).toBe(
      'removed'
    );
    for (const entryStatus of ['withdrawn', 'scratched', 'completed', 'not_accepted', 'moved']) {
      expect(evaluateWithdrawEligibility({ ...pending, entryStatus }).code, entryStatus).toBe(
        'status'
      );
    }
  });

  it('checks in the same order as the RPC — removed, then paid, then status', () => {
    // A soft-deleted, paid, already-withdrawn row must report "removed" here and
    // in Postgres, or the two surfaces tell the exhibitor different stories.
    expect(
      evaluateWithdrawEligibility({
        ...pending,
        deletedAt: '2026-09-15',
        paymentStatus: 'paid',
        entryStatus: 'withdrawn',
      }).code
    ).toBe('removed');
    expect(
      evaluateWithdrawEligibility({ ...pending, paymentStatus: 'paid', entryStatus: 'withdrawn' })
        .code
    ).toBe('paid');
  });

  it('carries the refusal reason onto the thrown error', () => {
    const error = new WithdrawNotAllowedError(
      evaluateWithdrawEligibility({ ...pending, paymentStatus: 'paid' })
    );
    expect(error.code).toBe('paid');
    expect(error.message).toContain('refund');
  });
});
