import { describe, it, expect } from 'vitest';
import {
  getEffectiveWithdrawalPolicy,
  resolveWithdrawalRefundCents,
  type WithdrawalPolicy,
} from '../withdrawalPolicy';

const NY = 'America/New_York';

const flatPolicy: WithdrawalPolicy = {
  cutoffDate: '2026-06-01',
  retentionType: 'flat',
  retentionValue: 1000, // $10 office fee, in cents
  notes: null,
};

const percentPolicy: WithdrawalPolicy = {
  cutoffDate: '2026-06-01',
  retentionType: 'percent',
  retentionValue: 25,
  notes: null,
};

describe('resolveWithdrawalRefundCents', () => {
  it('refunds the full entry fee before the cutoff (flat policy)', () => {
    const r = resolveWithdrawalRefundCents(flatPolicy, 3000, new Date('2026-05-15T12:00:00Z'), NY);
    expect(r.refundCents).toBe(3000);
    expect(r.retainedCents).toBe(0);
    expect(r.requiresManual).toBe(false);
    expect(r.reason).toBe('before_cutoff');
  });

  it('retains the flat office fee after the cutoff', () => {
    const r = resolveWithdrawalRefundCents(flatPolicy, 3000, new Date('2026-06-15T12:00:00Z'), NY);
    expect(r.retainedCents).toBe(1000);
    expect(r.refundCents).toBe(2000); // $30 − $10
    expect(r.reason).toBe('after_cutoff');
  });

  it('retains a percentage after the cutoff', () => {
    const r = resolveWithdrawalRefundCents(
      percentPolicy,
      3000,
      new Date('2026-06-15T12:00:00Z'),
      NY
    );
    expect(r.retainedCents).toBe(750); // 25% of $30
    expect(r.refundCents).toBe(2250);
  });

  it('percent rounding: retained + refunded always sum to the entry fee (round half up)', () => {
    // 25% of 333 = 83.25 → round-half-up to 83; refund = 250; sum = 333
    const r = resolveWithdrawalRefundCents(
      percentPolicy,
      333,
      new Date('2026-06-15T12:00:00Z'),
      NY
    );
    expect(r.retainedCents).toBe(83);
    expect(r.refundCents).toBe(250);
    expect(r.retainedCents + r.refundCents).toBe(333);

    // 25% of 2 = 0.5 → round-half-up to 1; refund = 1; sum = 2
    const r2 = resolveWithdrawalRefundCents(percentPolicy, 2, new Date('2026-06-15T12:00:00Z'), NY);
    expect(r2.retainedCents).toBe(1);
    expect(r2.refundCents).toBe(1);
    expect(r2.retainedCents + r2.refundCents).toBe(2);
  });

  it('TIMEZONE: an instant that is past the cutoff in UTC but not in the show tz resolves as before-cutoff', () => {
    // 2026-06-02T02:00Z == 2026-06-01 22:00 EDT → still June 1 in New York → full refund.
    // Evaluated in UTC this would be June 2 (after cutoff) and wrongly retain the fee.
    const r = resolveWithdrawalRefundCents(flatPolicy, 3000, new Date('2026-06-02T02:00:00Z'), NY);
    expect(r.reason).toBe('before_cutoff');
    expect(r.refundCents).toBe(3000);
  });

  it('treats the cutoff day itself as still-full (inclusive "until June 1")', () => {
    const r = resolveWithdrawalRefundCents(
      flatPolicy,
      3000,
      new Date('2026-06-01T15:00:00Z'), // June 1 11:00 EDT
      NY
    );
    expect(r.reason).toBe('before_cutoff');
    expect(r.refundCents).toBe(3000);
  });

  it('prose-only policy (no cutoff) suggests full and flags manual', () => {
    const prose: WithdrawalPolicy = {
      cutoffDate: null,
      retentionType: 'flat',
      retentionValue: 0,
      notes: 'Full → 50% → none across three dates; secretary decides.',
    };
    const r = resolveWithdrawalRefundCents(prose, 3000, new Date('2026-06-15T12:00:00Z'), NY);
    expect(r.refundCents).toBe(3000);
    expect(r.requiresManual).toBe(true);
    expect(r.reason).toBe('no_cutoff');
  });

  it('unset policy (null) suggests full and flags manual', () => {
    const r = resolveWithdrawalRefundCents(null, 3000, new Date('2026-06-15T12:00:00Z'), NY);
    expect(r.refundCents).toBe(3000);
    expect(r.requiresManual).toBe(true);
    expect(r.reason).toBe('no_policy');
  });

  it('flat fee larger than the entry fee never produces a negative refund', () => {
    const r = resolveWithdrawalRefundCents(flatPolicy, 500, new Date('2026-06-15T12:00:00Z'), NY);
    expect(r.refundCents).toBe(0);
    expect(r.retainedCents).toBe(500);
  });

  it('falls back to a default timezone when given an invalid one (no throw)', () => {
    const r = resolveWithdrawalRefundCents(
      flatPolicy,
      3000,
      new Date('2026-05-15T12:00:00Z'),
      'Not/AZone'
    );
    expect(r.refundCents).toBe(3000);
  });
});

describe('getEffectiveWithdrawalPolicy', () => {
  const club = {
    default_withdrawal_retention_type: 'flat',
    default_withdrawal_retention_value: 500,
    default_withdrawal_policy_notes: null,
  };

  const noShowOverride = {
    withdrawal_cutoff_date: null,
    withdrawal_retention_type: null,
    withdrawal_retention_value: null,
    withdrawal_policy_notes: null,
  };

  it('uses the show override when any override field is set', () => {
    const show = {
      withdrawal_cutoff_date: '2026-06-01',
      withdrawal_retention_type: 'percent',
      withdrawal_retention_value: 20,
      withdrawal_policy_notes: null,
    };
    const p = getEffectiveWithdrawalPolicy(show, club);
    expect(p).toEqual({
      cutoffDate: '2026-06-01',
      retentionType: 'percent',
      retentionValue: 20,
      notes: null,
    });
  });

  it('falls back to the club default when the show has no override', () => {
    const p = getEffectiveWithdrawalPolicy(noShowOverride, club);
    expect(p).toEqual({
      cutoffDate: null,
      retentionType: 'flat',
      retentionValue: 500,
      notes: null,
    });
  });

  // MYK9-454. A club default is retention + prose ONLY. An absolute calendar
  // date cannot be a club-wide default: entered once, it governs every future
  // show, and the day after it passes every inheriting show resolves
  // `after_cutoff` and keeps the office fee — with requiresManual false, so the
  // refund dialog pre-fills a confidently wrong number.
  it('never sources a cutoff date from the club row, even if the column holds one', () => {
    const legacyClub = { ...club, default_withdrawal_cutoff_date: '2026-05-01' };
    expect(getEffectiveWithdrawalPolicy(noShowOverride, legacyClub)?.cutoffDate).toBeNull();
  });

  it('leaves a club-only refund manual instead of retaining on a stale club cutoff', () => {
    const legacyClub = { ...club, default_withdrawal_cutoff_date: '2026-05-01' };
    const policy = getEffectiveWithdrawalPolicy(noShowOverride, legacyClub);

    const r = resolveWithdrawalRefundCents(policy, 3000, new Date('2026-08-01T12:00:00Z'), NY);

    expect(r.reason).toBe('no_cutoff');
    expect(r.refundCents).toBe(3000);
    expect(r.retainedCents).toBe(0);
    expect(r.requiresManual).toBe(true);
  });

  // MYK9-454 follow-up (Codex review of #2156). Dropping the club cutoff made
  // club retention UNREACHABLE: the show/club choice was all-or-nothing, so the
  // moment a show declared its cutoff the club's office fee was dropped with it
  // and a post-cutoff withdrawal refunded in full at `requiresManual: false`.
  // Resolution composes per field instead — which is what the card has always
  // promised ("Leave blank to inherit the club default").
  it('MONEY: a show cutoff inherits the club retention instead of zeroing it', () => {
    const p = getEffectiveWithdrawalPolicy({ withdrawal_cutoff_date: '2026-06-01' }, club);

    expect(p).toEqual({
      cutoffDate: '2026-06-01',
      retentionType: 'flat',
      retentionValue: 500,
      notes: null,
    });

    const r = resolveWithdrawalRefundCents(p, 3000, new Date('2026-08-01T12:00:00Z'), NY);
    expect(r.retainedCents).toBe(500);
    expect(r.refundCents).toBe(2500);
    expect(r.reason).toBe('after_cutoff');
  });

  it('a show that declares its own retention still overrides the club', () => {
    const p = getEffectiveWithdrawalPolicy(
      {
        withdrawal_cutoff_date: '2026-06-01',
        withdrawal_retention_type: 'percent',
        withdrawal_retention_value: 20,
      },
      club
    );
    expect(p?.retentionType).toBe('percent');
    expect(p?.retentionValue).toBe(20);
  });

  it('a show clearing its retention to nothing falls back to the club fee', () => {
    // The card nulls type+value as a PAIR, so "cleared" is both being null.
    const p = getEffectiveWithdrawalPolicy(
      {
        withdrawal_cutoff_date: '2026-06-01',
        withdrawal_retention_type: null,
        withdrawal_retention_value: null,
      },
      club
    );
    expect(p?.retentionValue).toBe(500);
  });

  // Adversarial review of #2156. Retention is a fee and composes; PROSE is a
  // description of a whole policy and does not. Inheriting a club's multi-tier
  // note onto a show that set its own cutoff produced a disclosure that
  // contradicted itself — "Full refund of the entry fee … No refunds after
  // August 1" — and that string is what Stripe shows the payer and what gets
  // frozen into the entry's snapshot. A show that declares anything is
  // authoring its own policy, so it gets its own prose or none.
  // Round 4 reversed the round-3 rule. Suppressing inheritance here also threw
  // away PROCEDURAL club notes ("withdrawals must be emailed to the secretary")
  // on every show that set a cutoff — and since the cutoff is show-only and
  // retention needs one to bite, that made a club's two remaining fields
  // mutually exclusive. Prose composes; the contradiction is fixed in the
  // formatter and in requiresManual instead.
  it('inherits club prose onto a show that declares no prose of its own', () => {
    const clubWithProse = { ...club, default_withdrawal_policy_notes: 'Email the secretary.' };

    const p = getEffectiveWithdrawalPolicy({ withdrawal_cutoff_date: '2026-06-01' }, clubWithProse);

    expect(p?.notes).toBe('Email the secretary.');
    expect(p?.retentionValue).toBe(500);
  });

  it('lets a show override the club prose with its own', () => {
    const clubWithProse = { ...club, default_withdrawal_policy_notes: 'Email the secretary.' };
    const p = getEffectiveWithdrawalPolicy(
      { withdrawal_cutoff_date: '2026-06-01', withdrawal_policy_notes: 'Call the show chair.' },
      clubWithProse
    );
    expect(p?.notes).toBe('Call the show chair.');
  });

  it('still inherits club prose when the show declares nothing at all', () => {
    const clubWithProse = { ...club, default_withdrawal_policy_notes: 'No refunds after Aug 1.' };
    const p = getEffectiveWithdrawalPolicy(noShowOverride, clubWithProse);
    expect(p?.notes).toBe('No refunds after Aug 1.');
  });

  // The system INFORMS; it must not compute a confident number that prose
  // contradicts. A cutoff with no structured retention says "keep nothing",
  // while the prose may impose a tier the resolver cannot evaluate.
  it('MONEY: prose with no structured retention forces a manual decision', () => {
    const p = getEffectiveWithdrawalPolicy(
      {
        withdrawal_cutoff_date: '2026-06-01',
        withdrawal_policy_notes: 'Then 50% until 7 days out, none after.',
      },
      null
    );

    const r = resolveWithdrawalRefundCents(p, 3000, new Date('2026-08-01T12:00:00Z'), NY);

    expect(r.requiresManual).toBe(true);
    expect(r.refundCents).toBe(3000);
    expect(r.retainedCents).toBe(0);
  });

  it('stays confident when a structured retention backs the number', () => {
    const p = getEffectiveWithdrawalPolicy(
      {
        withdrawal_cutoff_date: '2026-06-01',
        withdrawal_retention_type: 'flat',
        withdrawal_retention_value: 500,
        withdrawal_policy_notes: 'Email the secretary.',
      },
      null
    );
    const r = resolveWithdrawalRefundCents(p, 3000, new Date('2026-08-01T12:00:00Z'), NY);
    expect(r.requiresManual).toBe(false);
    expect(r.retainedCents).toBe(500);
  });

  it('returns null when neither show nor club declares a policy', () => {
    expect(getEffectiveWithdrawalPolicy(null, null)).toBeNull();
    expect(getEffectiveWithdrawalPolicy({}, {})).toBeNull();
  });

  it('treats a show with only prose notes as an override', () => {
    const p = getEffectiveWithdrawalPolicy(
      { withdrawal_policy_notes: 'See premium for details.' },
      club
    );
    expect(p?.notes).toBe('See premium for details.');
    expect(p?.cutoffDate).toBeNull();
  });
});
