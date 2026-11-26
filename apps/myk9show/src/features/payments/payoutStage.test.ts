import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLUB_FAILURE_REASON_PREFIX,
  resolvePayoutStage,
  type PayoutStageInput,
} from './payoutStage';

// Wed Dec 9 2026 is the show's last day; five business days later is Wed Dec 16.
const SCHEDULE = { lastDay: '2026-12-09', timeZone: 'America/New_York' };
const BEFORE_SHOW_ENDS = new Date('2026-12-08T15:00:00Z');
const AFTER_SHOW_ENDS = new Date('2026-12-11T15:00:00Z');
const AFTER_DUE_DATE = new Date('2026-12-17T15:00:00Z');

function stage(overrides: Partial<PayoutStageInput>) {
  return resolvePayoutStage({
    payout: null,
    accountState: 'enabled',
    schedule: SCHEDULE,
    fullyRefunded: false,
    now: AFTER_SHOW_ENDS,
    ...overrides,
  });
}

function payout(
  status: string,
  failureReason: string | null = null,
  completedAt: string | null = null
) {
  return { status, failureReason, completedAt };
}

describe('resolvePayoutStage: every show row answers "when do we get paid?"', () => {
  it('before the show ends: paid within five business days of the last day', () => {
    expect(stage({ now: BEFORE_SHOW_ENDS })).toEqual({
      kind: 'before-due',
      text: 'Paid within five business days of December 9.',
      action: null,
    });
  });

  it('after the show ends, before the payout is recorded: paid by the due date', () => {
    expect(stage({ now: AFTER_SHOW_ENDS }).text).toBe('Paid by December 16.');
  });

  it('a pending payout for a connected club reads the same deadline', () => {
    expect(stage({ payout: payout('pending') }).text).toBe('Paid by December 16.');
  });

  it.each(['awaiting_approval', 'approved', 'held'])(
    'a %s payout is being checked by myK9Show, never a problem',
    status => {
      const result = stage({ payout: payout(status, 'operator hold reason') });
      expect(result).toEqual({
        kind: 'checking',
        text: 'Being checked by myK9Show. Paid by December 16.',
        action: null,
      });
      expect(result.text).not.toMatch(/attention|fail|late|hold|reason/i);
    }
  );

  it('a payout being sent says so, with the deadline', () => {
    expect(stage({ payout: payout('processing') }).text).toBe(
      'Being sent now. Paid by December 16.'
    );
  });

  it('a sent payout gives the day it was sent, on the show calendar', () => {
    // 03:00Z on Dec 13 is still the evening of Dec 12 in New York.
    expect(stage({ payout: payout('completed', null, '2026-12-13T03:00:00Z') })).toEqual({
      kind: 'sent',
      text: 'Sent December 12. Usually in your account the next business day.',
      sentOn: { dateTime: '2026-12-13T03:00:00Z', label: 'December 12' },
      action: null,
    });
  });

  it('a payout sent in an earlier year carries the year', () => {
    const result = stage({
      payout: payout('completed', null, '2025-12-12T15:00:00Z'),
      now: new Date('2026-02-01T15:00:00Z'),
    });
    expect(result.text).toBe(
      'Sent December 12, 2025. Usually in your account the next business day.'
    );
  });

  it.each(['insufficient_balance: still clearing', 'stale_processing', 'Stripe rate limit', null])(
    "a failure that is the platform's (%s) says we are on it and there is nothing to do",
    reason => {
      expect(stage({ payout: payout('failed', reason) })).toEqual({
        kind: 'failed-platform',
        text: "We couldn't send this. We're on it, and you don't need to do anything. Paid by December 16.",
        action: null,
      });
    }
  );

  it("a failure that is the club's to fix names the bank account and carries the fix", () => {
    expect(
      stage({ payout: payout('failed', 'club_account:account_closed: The bank account is closed') })
    ).toEqual({
      kind: 'failed-club',
      text: "Your bank account needs attention. We can't send this payout until it's fixed.",
      action: 'fix-bank-account',
    });
  });

  it("the club's failure keeps its fix even past the due date", () => {
    expect(
      stage({ payout: payout('failed', 'club_account:no_account: x'), now: AFTER_DUE_DATE }).kind
    ).toBe('failed-club');
  });

  it('bank not connected: waiting for the club, with the link that connects it', () => {
    expect(stage({ accountState: 'not-enabled', payout: payout('pending') })).toEqual({
      kind: 'bank-not-connected',
      text: "Waiting for your club's bank account.",
      action: 'connect-bank-account',
    });
    expect(stage({ accountState: 'not-enabled', payout: null }).kind).toBe('bank-not-connected');
  });

  it.each([null, 'pending', 'awaiting_approval', 'approved', 'held', 'processing', 'failed'])(
    'past the due date, an unsent payout (%s) is delayed and never shows a past date',
    status => {
      const result = stage({ payout: status ? payout(status) : null, now: AFTER_DUE_DATE });
      expect(result).toEqual({
        kind: 'delayed',
        text: "Your payout is taking longer than usual. We'll be in touch by email.",
        action: null,
      });
      expect(result.text).not.toMatch(/December/);
    }
  );

  it('a fully refunded show has nothing to send, and never reads Paid', () => {
    const result = stage({ fullyRefunded: true });
    expect(result).toEqual({
      kind: 'nothing-to-send',
      text: 'Nothing to send. Every entry fee for this show was refunded.',
      action: null,
    });
    expect(result.text).not.toMatch(/paid|\$0/i);
  });

  it('without the show dates it still states the deadline, in words', () => {
    expect(stage({ schedule: null }).text).toBe(
      "Paid within five business days of the show's last day."
    );
    expect(stage({ schedule: null, payout: payout('awaiting_approval') }).text).toBe(
      "Being checked by myK9Show. Paid within five business days of the show's last day."
    );
  });

  it('never shows a raw status it cannot explain', () => {
    expect(stage({ payout: payout('mystery_status') })).toEqual({
      kind: 'unknown',
      text: "We can't show where this payout is right now.",
      action: null,
    });
  });

  it('no stage sentence says "automatically"', () => {
    const statuses = [null, 'pending', 'awaiting_approval', 'processing', 'completed', 'failed'];
    for (const status of statuses) {
      for (const now of [BEFORE_SHOW_ENDS, AFTER_SHOW_ENDS, AFTER_DUE_DATE]) {
        const result = stage({
          payout: status ? payout(status, null, '2026-12-12T15:00:00Z') : null,
          now,
        });
        expect(result.text).not.toMatch(/automatic/i);
      }
    }
  });
});

describe('the club-failure marker mirrors the payout run', () => {
  it('equals CLUB_FAILURE_REASON_PREFIX in _shared/payoutFailureOwner.ts', () => {
    const server = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        'supabase',
        'functions',
        '_shared',
        'payoutFailureOwner.ts'
      ),
      'utf8'
    );
    expect(server).toContain(
      `export const CLUB_FAILURE_REASON_PREFIX = '${CLUB_FAILURE_REASON_PREFIX}';`
    );
  });
});
