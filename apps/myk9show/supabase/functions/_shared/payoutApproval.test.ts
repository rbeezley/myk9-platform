import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  PAYOUT_ALERT_SOURCE,
  PAYOUT_REMINDER_INTERVAL_HOURS,
  awaitingApprovalAlert,
  awaitingApprovalDedupeKey,
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
    createdAt: '2026-11-10T02:00:00.000Z',
    ...overrides,
  };
}

describe('payout brake: which shows the run works', () => {
  it.each([
    [null, true],
    ['pending', true],
    ['awaiting_approval', true],
    ['approved', true],
    ['held', false],
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

  it('held: the run never reaches the send point', () => {
    expect(shouldEvaluateShow('held')).toBe(false);
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

  it('raises nothing when no reminder is due or the claim fails', async () => {
    const alert = vi.fn(async () => {});
    expect(await remindAwaitingApprovals({ claimDueReminders: async () => [], alert }, 0)).toBe(0);
    expect(await remindAwaitingApprovals({ claimDueReminders: async () => null, alert }, 0)).toBe(
      0
    );
    expect(alert).not.toHaveBeenCalled();
  });

  it('says the payout will not be sent until approved, with no em dash', () => {
    const { html, subject } = awaitingApprovalAlert(payout('c'));
    expect(html.replace(/\s+/g, ' ')).toContain('will not be sent until you approve it');
    expect(`${subject}${html}`).not.toContain('—');
  });

  it('uses the source and dedupe key the approve and hold RPCs resolve', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    const resolveClause = `a.source = '${PAYOUT_ALERT_SOURCE}'
     AND a.dedupe_key = '${awaitingApprovalDedupeKey('')}' || p_payout_id::text`;
    expect(sql.split(resolveClause)).toHaveLength(3);
  });
});
