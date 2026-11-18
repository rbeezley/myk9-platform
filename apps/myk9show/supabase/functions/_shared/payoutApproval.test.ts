import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  PAYOUT_ALERT_SOURCE,
  PAYOUT_REMINDER_INTERVAL_HOURS,
  awaitingApprovalAlert,
  awaitingApprovalDedupeKey,
  approvalMismatch,
  carriedApprovalFrom,
  parseBrakeSetting,
  remindAwaitingApprovals,
  sendOrWait,
  shouldEvaluateShow,
  type AwaitingPayout,
} from './payoutApproval';

const MIGRATION = resolve(
  __dirname,
  '../../../../../supabase/migrations/20261118211700_myk9_2170_payout_brake.sql'
);

function payout(id: string, overrides: Partial<AwaitingPayout> = {}): AwaitingPayout {
  return {
    id,
    showId: `show-${id}`,
    showName: `Show ${id}`,
    amountCents: 12_345,
    ...overrides,
  };
}

describe('payout brake: which shows the run works', () => {
  it.each([
    [null, true],
    ['pending', true],
    ['awaiting_approval', true],
    ['approved', true],
    ['held', true],
    ['processing', false],
    ['completed', false],
    ['something_new', false],
  ])('live row %s -> evaluated %s', (status, expected) => {
    expect(shouldEvaluateShow(status)).toBe(expected);
  });
});

describe('payout brake: send or wait at the send point', () => {
  it('brake on: a new payout waits for approval', () => {
    expect(sendOrWait({ brakeOn: true, liveStatus: null, carriedApprovalAt: null })).toBe(
      'wait_for_approval'
    );
  });

  it('brake on: a parked pending payout whose club can now receive money waits', () => {
    expect(sendOrWait({ brakeOn: true, liveStatus: 'pending', carriedApprovalAt: null })).toBe(
      'wait_for_approval'
    );
  });

  it('brake on: a payout already waiting keeps waiting', () => {
    expect(
      sendOrWait({ brakeOn: true, liveStatus: 'awaiting_approval', carriedApprovalAt: null })
    ).toBe('wait_for_approval');
  });

  it('brake on: an approved payout sends', () => {
    expect(sendOrWait({ brakeOn: true, liveStatus: 'approved', carriedApprovalAt: null })).toBe(
      'send'
    );
  });

  it('brake on: the retry of an approved attempt that failed sends without a second approval', () => {
    expect(
      sendOrWait({
        brakeOn: true,
        liveStatus: null,
        carriedApprovalAt: '2026-11-15T10:00:00.000Z',
      })
    ).toBe('send');
  });

  it('brake off: every payout sends as before, including one recorded while the brake was on', () => {
    for (const liveStatus of [null, 'pending', 'awaiting_approval', 'approved']) {
      expect(sendOrWait({ brakeOn: false, liveStatus, carriedApprovalAt: null })).toBe('send');
    }
  });
});

describe('payout brake: what a failed approved attempt carries to its retry', () => {
  const approvedAt = '2026-11-15T10:00:00.000Z';
  const approval = { approvedAt, amountCents: 10_000, stripeAccountId: 'acct_club' };
  const failed = (failure_reason: string | null) => ({
    status: 'failed',
    approved_at: approvedAt,
    approved_amount_cents: 10_000,
    approved_stripe_account_id: 'acct_club',
    failure_reason,
  });

  it.each([
    'insufficient_balance: Your available balance is too low',
    'stale_processing',
    'entries_load_failed_post_claim',
  ])('a self-healing failure (%s) keeps the approval', reason => {
    expect(carriedApprovalFrom(failed(reason))).toEqual(approval);
  });

  it.each([
    'account_closed',
    'Destination account changed',
    'insufficient_capabilities_for_transfer: payouts disabled',
    null,
    '',
  ])('any other failure (%s) waits for approval again', reason => {
    expect(carriedApprovalFrom(failed(reason))).toBeNull();
  });

  it('carries nothing from an attempt that was never approved, is not failed, or does not exist', () => {
    expect(
      carriedApprovalFrom({
        status: 'failed',
        approved_at: null,
        approved_amount_cents: null,
        approved_stripe_account_id: null,
        failure_reason: 'stale_processing',
      })
    ).toBeNull();
    expect(carriedApprovalFrom({ ...failed(null), status: 'completed' })).toBeNull();
    expect(carriedApprovalFrom(null)).toBeNull();
  });

  it('a retry that carries nothing waits while the brake is on', () => {
    const carriedApprovalAt = carriedApprovalFrom(failed('account_closed'))?.approvedAt ?? null;
    expect(sendOrWait({ brakeOn: true, liveStatus: null, carriedApprovalAt })).toBe(
      'wait_for_approval'
    );
  });
});

describe('payout brake: what an approval covers', () => {
  const approval = {
    approvedAt: '2026-11-15T10:00:00.000Z',
    amountCents: 10_000,
    stripeAccountId: 'acct_club',
  };

  it('covers the same destination for the approved amount or less', () => {
    expect(
      approvalMismatch(approval, { amountCents: 10_000, stripeAccountId: 'acct_club' })
    ).toBeNull();
    expect(
      approvalMismatch(approval, { amountCents: 6_000, stripeAccountId: 'acct_club' })
    ).toBeNull();
  });

  it('does not cover a larger amount or a different destination', () => {
    expect(approvalMismatch(approval, { amountCents: 10_001, stripeAccountId: 'acct_club' })).toBe(
      'the amount rose from $100.00 to $100.01 since approval'
    );
    expect(approvalMismatch(approval, { amountCents: 10_000, stripeAccountId: 'acct_other' })).toBe(
      'the destination account changed from acct_club to acct_other since approval'
    );
  });
});

describe('payout brake: reading the setting', () => {
  it('reads on and off', () => {
    expect(parseBrakeSetting({ data: { payouts_require_approval: true }, error: null })).toEqual({
      ok: true,
      on: true,
    });
    expect(parseBrakeSetting({ data: { payouts_require_approval: false }, error: null })).toEqual({
      ok: true,
      on: false,
    });
  });

  it('is not ok on a read error, a missing row or a missing column', () => {
    expect(parseBrakeSetting({ data: null, error: { message: 'boom' } })).toEqual({
      ok: false,
      message: 'boom',
    });
    expect(parseBrakeSetting({ data: null, error: null }).ok).toBe(false);
    expect(parseBrakeSetting({ data: {}, error: null }).ok).toBe(false);
    expect(parseBrakeSetting({ data: { payouts_require_approval: 'true' }, error: null }).ok).toBe(
      false
    );
  });
});

describe('payout brake: daily reminders', () => {
  it('claims reminders older than the interval and alerts once per claimed payout', async () => {
    const now = Date.parse('2026-11-17T02:00:00.000Z');
    const claimDueReminders = vi.fn(async () => [payout('a'), payout('b', { showName: null })]);
    const alert = vi.fn(async () => {});

    const count = await remindAwaitingApprovals({ claimDueReminders, alert }, now);

    expect(count).toBe(2);
    expect(claimDueReminders).toHaveBeenCalledWith(
      new Date(now - PAYOUT_REMINDER_INTERVAL_HOURS * 3600 * 1000).toISOString()
    );
    expect(alert).toHaveBeenCalledTimes(2);
    expect(alert).toHaveBeenNthCalledWith(
      1,
      'Payout waiting for your approval: Show a',
      expect.stringContaining('$123.45'),
      'payout-awaiting-approval-a'
    );
    expect(alert).toHaveBeenNthCalledWith(
      2,
      'Payout waiting for your approval: show-b',
      expect.any(String),
      'payout-awaiting-approval-b'
    );
  });

  it('raises nothing when no reminder is due, and reports a failed claim as null, not zero', async () => {
    const alert = vi.fn(async () => {});
    expect(await remindAwaitingApprovals({ claimDueReminders: async () => [], alert }, 0)).toBe(0);
    expect(
      await remindAwaitingApprovals({ claimDueReminders: async () => null, alert }, 0)
    ).toBeNull();
    expect(alert).not.toHaveBeenCalled();
  });

  it('says the payout will not be sent until approved, with no em dash', () => {
    const { html, subject } = awaitingApprovalAlert(payout('c'));
    expect(html.replace(/\s+/g, ' ')).toContain('will not be sent until you approve it');
    expect(`${subject}${html}`).not.toContain('—');
  });

  it('escapes the club-supplied show name in the email body, not the plain-text subject', () => {
    const { html, subject } = awaitingApprovalAlert(
      payout('d', { showName: '<a href="https://evil.example">Fall</a> & Co' })
    );
    expect(html).toContain(
      '&lt;a href=&quot;https://evil.example&quot;&gt;Fall&lt;/a&gt; &amp; Co'
    );
    expect(html).not.toContain('<a href');
    expect(subject).toBe(
      'Payout waiting for your approval: <a href="https://evil.example">Fall</a> & Co'
    );
  });

  it('uses the source and dedupe key the reminder-resolution trigger resolves', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    const resolveClause = `a.source = '${PAYOUT_ALERT_SOURCE}'
     AND a.dedupe_key = '${awaitingApprovalDedupeKey('')}' || NEW.id::text`;
    expect(sql.split(resolveClause)).toHaveLength(2);
  });
});
