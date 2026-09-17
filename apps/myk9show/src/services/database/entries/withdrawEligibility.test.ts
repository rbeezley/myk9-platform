/**
 * MYK9-535: the withdraw predicate is the one place the UI affordance, the
 * client pre-check and the RPC's owner-tier guards agree. These pin the exact
 * id/status SHAPES the app emits, and the refusal ORDER, which must match
 * `20260915203300_withdraw_own_entry_rpc.sql`.
 */
import { describe, expect, it } from 'vitest';
import {
  evaluateWithdrawEligibility,
  withdrawErrorMessage,
  OWNER_WITHDRAWABLE_ENTRY_STATUSES,
  PRE_SHOW_CHECK_IN_STATUSES,
  WithdrawNotAllowedError,
  WithdrawUnavailableError,
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

  // MYK9-632, owner decision 2026-09-17: there is NO money guard on either act.
  // The old 'This entry is paid — request a refund instead of withdrawing.'
  // refusal left a paid exhibitor with no honest way to say they were not
  // coming, and it kept their row out of the queue where the refund decision is
  // actually made. `git log -S` on that sentence lands on the MYK9-535
  // implementation commit (7e01892cb) — it was a cautious default, never a
  // rulebook rule. Neither act writes a money column; the RPC's behavioural
  // test pins that.
  it('allows BOTH acts on a paid entry — no money guard on either', () => {
    for (const kind of ['withdraw', 'pull'] as const) {
      for (const paymentStatus of ['paid', 'refunded', 'waived', 'pending']) {
        expect(
          evaluateWithdrawEligibility({ ...pending, kind, paymentStatus }).allowed,
          `${kind} / ${paymentStatus}`
        ).toBe(true);
      }
    }
  });

  it('allows a withdrawal when the payment status cannot be determined at all', () => {
    // Nothing downstream reads it any more, so an unknown status is not a reason
    // to refuse — it was only ever a proxy for the guard that is now gone.
    expect(evaluateWithdrawEligibility({ ...pending, paymentStatus: null }).allowed).toBe(true);
    expect(
      evaluateWithdrawEligibility({
        ...pending,
        paymentStatus: 'pending',
        enrollmentPaymentStatus: 'paid',
      }).allowed
    ).toBe(true);
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

  it('checks in the same order as the RPC — removed, then status', () => {
    // A soft-deleted, already-withdrawn row must report "removed" here and in
    // Postgres, or the two surfaces tell the exhibitor different stories.
    expect(
      evaluateWithdrawEligibility({
        ...pending,
        deletedAt: '2026-09-15',
        entryStatus: 'withdrawn',
      }).code
    ).toBe('removed');
    expect(evaluateWithdrawEligibility({ ...pending, entryStatus: 'withdrawn' }).code).toBe(
      'status'
    );
  });

  it('names the ACT in the refusal, so the chooser greys the right half', () => {
    expect(
      evaluateWithdrawEligibility({ ...pending, kind: 'pull', entryStatus: 'completed' }).reason
    ).toContain('pulled');
    expect(
      evaluateWithdrawEligibility({ ...pending, kind: 'withdraw', entryStatus: 'completed' }).reason
    ).toContain('withdrawn');
  });

  it('carries the refusal reason onto the thrown error', () => {
    const error = new WithdrawNotAllowedError(
      evaluateWithdrawEligibility({ ...pending, entryStatus: 'completed' })
    );
    expect(error.code).toBe('status');
    expect(error.message).toContain('withdrawn');
  });
});

/**
 * Every server refusal used to reach the exhibitor as raw Postgres text
 * carrying the row UUID. The dialog now switches on the CODE; the raw message
 * stays in the logger.
 */
describe('withdrawErrorMessage', () => {
  it('never leaks the raw Postgres text or the row UUID', () => {
    const message = withdrawErrorMessage({
      code: '42501',
      message:
        'Entry 22eb47a9-ce86-4906-8053-a224d37d1602 is checked in at the show and cannot be withdrawn',
    });

    expect(message).not.toContain('22eb47a9');
    expect(message).not.toMatch(/Entry [0-9a-f]{8}-/);
    expect(message).toMatch(/show secretary/i);
  });

  it('maps each SQLSTATE the RPC raises to its own sentence', () => {
    expect(withdrawErrorMessage({ code: '22023' })).toMatch(/something went wrong/i);
    expect(withdrawErrorMessage({ code: 'P0002' })).toMatch(/no longer exists/i);
    expect(withdrawErrorMessage({ code: '40001' })).toMatch(/someone else changed/i);
    // Four distinct sentences, so the mapping cannot collapse to one.
    const messages = ['42501', '22023', 'P0002', '40001'].map(code =>
      withdrawErrorMessage({ code })
    );
    expect(new Set(messages).size).toBe(4);
  });

  it('passes our own pre-check refusals through, since they already read well', () => {
    const eligibility = evaluateWithdrawEligibility({ ...pending, entryStatus: 'completed' });
    expect(withdrawErrorMessage({ code: eligibility.code, message: eligibility.reason })).toBe(
      eligibility.reason
    );
  });

  it('falls back to a plain sentence for an unclassified failure', () => {
    expect(withdrawErrorMessage({ message: 'TypeError: Failed to fetch' })).toMatch(
      /couldn't withdraw this entry/i
    );
    expect(withdrawErrorMessage(null)).toMatch(/couldn't withdraw this entry/i);
  });

  // MYK9-632: an exhibitor who clicked Pull and is told "try withdrawing again"
  // is being told about a different action than the one they took — the same
  // word-swap this issue exists to undo, moved onto the failure path.
  it('speaks in the verb of the act that failed', () => {
    for (const [kind, fails, succeeds] of [
      ['pull', /withdraw/i, /pull/i],
      ['withdraw', /\bpull/i, /withdraw/i],
    ] as const) {
      for (const error of [
        null,
        { message: 'TypeError: Failed to fetch' },
        { code: '42501' },
        { code: '22023' },
      ]) {
        const message = withdrawErrorMessage(error, kind);
        expect(message, `${kind} / ${JSON.stringify(error)}`).toMatch(succeeds);
        expect(message, `${kind} / ${JSON.stringify(error)}`).not.toMatch(fails);
      }
    }
  });

  it('carries the verb onto the typed errors the replication layer throws', () => {
    expect(new WithdrawUnavailableError('pull').message).toMatch(/try pulling again/i);
    expect(new WithdrawUnavailableError('withdraw').message).toMatch(/try withdrawing again/i);
    // Default stays 'withdraw', which is what every pre-MYK9-632 caller meant.
    expect(new WithdrawUnavailableError().message).toMatch(/try withdrawing again/i);

    const noReason = { allowed: false } as const;
    expect(new WithdrawNotAllowedError(noReason, 'pull').message).toMatch(/cannot be pulled/i);
    expect(new WithdrawNotAllowedError(noReason, 'withdraw').message).toMatch(
      /cannot be withdrawn/i
    );
  });
});
