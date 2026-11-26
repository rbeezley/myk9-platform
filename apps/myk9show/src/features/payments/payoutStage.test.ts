import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { payoutFigures, payoutFiguresWith } from './clubShowPayoutFiguresFixtures';
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
    figures: payoutFigures(),
    accountState: 'enabled',
    schedule: SCHEDULE,
    now: AFTER_SHOW_ENDS,
    ...overrides,
  });
}

/** Figures for a show still owed $50.00 whose canonical payout row is in `status`. */
function payout(
  status: string,
  failureReason: string | null = null,
  completedAt: string | null = null
) {
  return payoutFiguresWith(status, {
    payout_failure_reason: failureReason,
    ...(completedAt ? { payout_completed_at: completedAt } : {}),
  });
}

/** Every online fee refunded: the server owes nothing. */
const REFUNDED_ROW = { refunded_cents: 5000, owed_cents: 0 };

describe('resolvePayoutStage: every show row answers "when do we get paid?"', () => {
  it('before the show ends: paid within five business days of the last day', () => {
    expect(stage({ now: BEFORE_SHOW_ENDS })).toEqual({
      kind: 'before-due',
      text: 'Paid within five business days of December 9.',
    });
  });

  it('after the show ends, before the payout is recorded: paid by the due date', () => {
    expect(stage({ now: AFTER_SHOW_ENDS }).text).toBe('Paid by December 16.');
  });

  it('a pending payout for a connected club reads the same deadline', () => {
    expect(stage({ figures: payout('pending') }).text).toBe('Paid by December 16.');
  });

  it.each(['awaiting_approval', 'approved', 'held'])(
    'a %s payout is being checked by myK9Show, never a problem',
    status => {
      const result = stage({ figures: payout(status, 'operator hold reason') });
      expect(result).toEqual({
        kind: 'checking',
        text: 'Being checked by myK9Show. Paid by December 16.',
      });
      expect(result.text).not.toMatch(/attention|fail|late|hold|reason/i);
    }
  );

  it('a payout being sent says so, with the deadline', () => {
    expect(stage({ figures: payout('processing') }).text).toBe(
      'Being sent now. Paid by December 16.'
    );
  });

  it('a sent payout gives the day it was sent, on the show calendar', () => {
    // 03:00Z on Dec 13 is still the evening of Dec 12 in New York.
    expect(stage({ figures: payout('completed', null, '2026-12-13T03:00:00Z') })).toEqual({
      kind: 'sent',
      text: 'Sent December 12. Usually in your account the next business day.',
      sentOn: { dateTime: '2026-12-13T03:00:00Z', label: 'December 12' },
    });
  });

  it('a payout sent in an earlier year carries the year', () => {
    const result = stage({
      figures: payout('completed', null, '2025-12-12T15:00:00Z'),
      now: new Date('2026-02-01T15:00:00Z'),
    });
    expect(result.text).toBe(
      'Sent December 12, 2025. Usually in your account the next business day.'
    );
  });

  it.each(['insufficient_balance: still clearing', 'stale_processing', 'Stripe rate limit', null])(
    "a failure that is the platform's (%s) says we are on it and there is nothing to do",
    reason => {
      expect(stage({ figures: payout('failed', reason) })).toEqual({
        kind: 'failed-platform',
        text: "We couldn't send this. We're on it, and you don't need to do anything. Paid by December 16.",
      });
    }
  );

  it("a failure that is the club's to fix points at the Bank account card", () => {
    expect(
      stage({
        figures: payout('failed', 'club_account:account_closed: The bank account is closed'),
      })
    ).toEqual({
      kind: 'failed-club',
      text: 'Your bank account needs attention. See Bank account above.',
    });
  });

  it("the club's failure keeps its fix even past the due date", () => {
    expect(
      stage({ figures: payout('failed', 'club_account:no_account: x'), now: AFTER_DUE_DATE }).kind
    ).toBe('failed-club');
  });

  it('bank not connected: waiting for the club, pointing at the Bank account card', () => {
    expect(stage({ accountState: 'not-enabled', figures: payout('pending') })).toEqual({
      kind: 'bank-not-connected',
      text: "Waiting for your club's bank account. See Bank account above.",
    });
    expect(stage({ accountState: 'not-enabled' }).kind).toBe('bank-not-connected');
  });

  it.each([null, 'pending', 'awaiting_approval', 'approved', 'held', 'processing', 'failed'])(
    'past the due date, an unsent payout (%s) is delayed and never shows a past date',
    status => {
      const result = stage({
        figures: status ? payout(status) : payoutFigures(),
        now: AFTER_DUE_DATE,
      });
      expect(result).toEqual({
        kind: 'delayed',
        text: "Your payout is taking longer than usual. We'll be in touch by email.",
      });
      expect(result.text).not.toMatch(/December/);
    }
  );

  // Whether anything is owed is the server's owed_cents, never a stored payout
  // amount; end-to-end precedence lives in financial/payoutStagePrecedence.test.ts.
  it.each([null, 'pending', 'awaiting_approval', 'approved', 'held', 'failed'])(
    'nothing owed (refunded) wins over a %s row, any day, with or without a bank',
    status => {
      const figures = status
        ? payoutFiguresWith(status, REFUNDED_ROW)
        : payoutFigures(REFUNDED_ROW);
      for (const now of [BEFORE_SHOW_ENDS, AFTER_SHOW_ENDS, AFTER_DUE_DATE]) {
        for (const accountState of ['enabled', 'not-enabled'] as const) {
          expect(stage({ figures, now, accountState })).toEqual({
            kind: 'nothing-to-send',
            text: 'Nothing to send. Every entry fee for this show was refunded.',
          });
        }
      }
    }
  );

  it('nothing owed (no fees) reads its own sentence, never "refunded"', () => {
    expect(stage({ figures: payoutFigures({ collected_cents: 0, owed_cents: 0 }) })).toEqual({
      kind: 'nothing-to-send',
      text: 'Nothing to send. This show has no online entry fees to pay out.',
    });
  });

  it('nothing owed wins over a club-account failure: no bank request forever', () => {
    const figures = payoutFiguresWith('failed', {
      ...REFUNDED_ROW,
      payout_failure_reason: 'club_account:account_closed: x',
    });
    expect(stage({ figures }).kind).toBe('nothing-to-send');
  });

  it('a completed payout with money reads Sent even when nothing is owed now', () => {
    expect(stage({ figures: payoutFiguresWith('completed', REFUNDED_ROW) }).kind).toBe('sent');
  });

  it('a $0 completed close-out row is nothing to send, never Sent', () => {
    const figures = payoutFiguresWith('completed', { ...REFUNDED_ROW, payout_amount_cents: 0 });
    expect(stage({ figures }).text).toBe(
      'Nothing to send. Every entry fee for this show was refunded.'
    );
  });

  it('a transfer already in flight reads Being sent, even if the owed figure says 0', () => {
    expect(stage({ figures: payoutFiguresWith('processing', REFUNDED_ROW) }).kind).toBe('sending');
  });

  it("owed is the server's live figure: a parked row's stale amount never makes it owed", () => {
    // The row still carries $50.00 from before the refund; the payout run would send $0.
    const figures = payoutFiguresWith('awaiting_approval', {
      ...REFUNDED_ROW,
      payout_amount_cents: 5000,
    });
    expect(stage({ figures }).kind).toBe('nothing-to-send');
  });

  it('without any show date it still states the deadline, in words', () => {
    const undated = { show_end_date: null };
    expect(stage({ schedule: null, figures: payoutFigures(undated) }).text).toBe(
      "Paid within five business days of the show's last day."
    );
    expect(
      stage({ schedule: null, figures: payoutFiguresWith('awaiting_approval', undated) }).text
    ).toBe("Being checked by myK9Show. Paid within five business days of the show's last day.");
  });

  // The shows read never returns a soft-deleted show, which the figures RPC keeps.
  it("with no schedule, the server's end date carries the promise", () => {
    expect(stage({ schedule: null }).text).toBe('Paid by December 16.');
  });

  it('with no schedule, a show long past its date and nothing paid reports the delay', () => {
    const figures = payoutFiguresWith('awaiting_approval', {
      show_end_date: '2026-10-03T00:00:00+00:00',
      show_deleted: true,
    });
    expect(stage({ schedule: null, figures })).toEqual({
      kind: 'delayed',
      text: "Your payout is taking longer than usual. We'll be in touch by email.",
    });
  });

  it('never shows a raw status it cannot explain', () => {
    expect(stage({ figures: payout('mystery_status') })).toEqual({
      kind: 'unknown',
      text: "We can't show where this payout is right now.",
    });
  });

  it('no stage sentence says "automatically"', () => {
    const statuses = [null, 'pending', 'awaiting_approval', 'processing', 'completed', 'failed'];
    for (const status of statuses) {
      for (const now of [BEFORE_SHOW_ENDS, AFTER_SHOW_ENDS, AFTER_DUE_DATE]) {
        const result = stage({
          figures: status ? payout(status, null, '2026-12-12T15:00:00Z') : payoutFigures(),
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
