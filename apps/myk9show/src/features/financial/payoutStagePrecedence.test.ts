/**
 * MYK9-1985: what a club reads for a show, end to end from a club_show_payout_figures
 * row (MYK9-2454) through toClubShowPayoutFigures to resolvePayoutStage. Every money
 * input is the server's: `owed_cents` decides whether anything is owed, `paid_cents`
 * and the canonical payout row decide whether money moved. A stored payout amount
 * never decides either.
 *
 * Precedence, top to bottom:
 *   1. a completed payout with money: Sent (money moved, whatever came after)
 *   2. nothing owed, refunded: Nothing to send (refunded)
 *   3. nothing owed, no fees: Nothing to send (no online entry fees)
 *   4. a club-account failure: Fix it
 *   5. everything else, unchanged
 */
import { describe, it, expect } from 'vitest';
import { toClubShowPayoutFigures } from '@/features/payments/clubShowPayoutFigures';
import type { ClubShowPayoutFiguresRow } from '@/features/payments/clubShowPayoutFigures';
import {
  payoutFiguresRow,
  payoutFiguresRowWith,
} from '@/features/payments/clubShowPayoutFiguresFixtures';
import { resolvePayoutStage } from '@/features/payments/payoutStage';
import type { PayoutsAccountState } from '@/features/payments/payoutBadge';

// Wed Dec 9 2026 last day; paid by Wed Dec 16.
const SCHEDULE = { lastDay: '2026-12-09', timeZone: 'America/New_York' };
const AFTER_SHOW = new Date('2026-12-11T15:00:00Z');
const PAST_DUE = new Date('2026-12-17T15:00:00Z');

const SENT = 'Sent December 12. Usually in your account the next business day.';
const REFUNDED = 'Nothing to send. Every entry fee for this show was refunded.';
const NO_FEES = 'Nothing to send. This show has no online entry fees to pay out.';
const FIX = "Your bank account needs attention. We can't send this payout until it's fixed.";
const BANK = "Waiting for your club's bank account.";
const CHECKING = 'Being checked by myK9Show. Paid by December 16.';
const SENDING = 'Being sent now. Paid by December 16.';
const PAID_BY = 'Paid by December 16.';
const PLATFORM =
  "We couldn't send this. We're on it, and you don't need to do anything. Paid by December 16.";
const DELAYED = "Your payout is taking longer than usual. We'll be in touch by email.";

/** Every online fee refunded: the server owes nothing. */
const ALL_REFUNDED = { refunded_cents: 5000, owed_cents: 0 };
/** A show with no online entry fees to send. */
const ZERO_FEES = { collected_cents: 0, owed_cents: 0 };
const CLUB_FAILURE = 'club_account:account_closed: The bank account is closed';

interface Case {
  name: string;
  row: ClubShowPayoutFiguresRow;
  accountState?: PayoutsAccountState;
  now?: Date;
  text: string;
}

const CASES: Case[] = [
  // 1. Money moved.
  { name: 'a sent payout', row: payoutFiguresRowWith('completed'), text: SENT },
  {
    name: 'a sent payout whose fees were refunded later still reads Sent',
    row: payoutFiguresRowWith('completed', ALL_REFUNDED),
    text: SENT,
  },
  // 2. Nothing owed, refunded.
  {
    name: 'a fully refunded show with no payout row',
    row: payoutFiguresRow(ALL_REFUNDED),
    text: REFUNDED,
  },
  {
    name: 'a $0 completed close-out row of a refunded show',
    row: payoutFiguresRowWith('completed', { ...ALL_REFUNDED, payout_amount_cents: 0 }),
    text: REFUNDED,
  },
  {
    name: 'Codex (b): a club-account failure whose fees were then refunded: no Fix it forever',
    row: payoutFiguresRowWith('failed', { ...ALL_REFUNDED, payout_failure_reason: CLUB_FAILURE }),
    text: REFUNDED,
  },
  {
    name: 'a $0 failed row of a refunded show',
    row: payoutFiguresRowWith('failed', {
      ...ALL_REFUNDED,
      payout_amount_cents: 0,
      payout_failure_reason: 'Stripe rate limit',
    }),
    text: REFUNDED,
  },
  ...(['pending', 'awaiting_approval', 'approved', 'held'] as const).map(status => ({
    name: `Codex (c): a ${status} row still holding $50.00 after a full refund`,
    row: payoutFiguresRowWith(status, { ...ALL_REFUNDED, payout_amount_cents: 5000 }),
    text: REFUNDED,
  })),
  {
    name: 'Codex (c): the same parked row past the due date is not delayed',
    row: payoutFiguresRowWith('awaiting_approval', ALL_REFUNDED),
    now: PAST_DUE,
    text: REFUNDED,
  },
  {
    name: 'a fully refunded show past the due date is not delayed',
    row: payoutFiguresRow(ALL_REFUNDED),
    now: PAST_DUE,
    text: REFUNDED,
  },
  // 3. Nothing owed, no fees.
  {
    name: 'Codex (a): a known $0 owed, no refunds, no payout row: no "Paid by"',
    row: payoutFiguresRow(ZERO_FEES),
    text: NO_FEES,
  },
  {
    name: 'Codex (a): the same show without a bank account: no "Connect bank account"',
    row: payoutFiguresRow(ZERO_FEES),
    accountState: 'not-enabled',
    text: NO_FEES,
  },
  {
    name: 'Codex (a): the same show past the due date: not delayed',
    row: payoutFiguresRow(ZERO_FEES),
    now: PAST_DUE,
    text: NO_FEES,
  },
  {
    name: 'a $0 pending row with no bank account and no refunds',
    row: payoutFiguresRowWith('pending', { ...ZERO_FEES, payout_amount_cents: 0 }),
    accountState: 'not-enabled',
    text: NO_FEES,
  },
  // 4. The club's to fix.
  {
    name: 'a club-account failure with money still owed',
    row: payoutFiguresRowWith('failed', { payout_failure_reason: CLUB_FAILURE }),
    text: FIX,
  },
  {
    name: 'a club-account failure past the due date keeps its fix',
    row: payoutFiguresRowWith('failed', { payout_failure_reason: CLUB_FAILURE }),
    now: PAST_DUE,
    text: FIX,
  },
  // 5. Everything else.
  {
    name: 'money owed, no bank account',
    row: payoutFiguresRow(),
    accountState: 'not-enabled',
    text: BANK,
  },
  { name: 'money owed, no payout row yet', row: payoutFiguresRow(), text: PAID_BY },
  {
    name: 'money owed, waiting for approval',
    row: payoutFiguresRowWith('awaiting_approval'),
    text: CHECKING,
  },
  {
    name: 'a parked row whose stored amount is $0 while the server still owes money',
    row: payoutFiguresRowWith('awaiting_approval', { payout_amount_cents: 0 }),
    text: CHECKING,
  },
  { name: 'a transfer in flight', row: payoutFiguresRowWith('processing'), text: SENDING },
  {
    name: 'a platform failure with money owed',
    row: payoutFiguresRowWith('failed', { payout_failure_reason: 'Stripe rate limit' }),
    text: PLATFORM,
  },
  {
    name: 'money owed past the due date is delayed',
    row: payoutFiguresRowWith('awaiting_approval'),
    now: PAST_DUE,
    text: DELAYED,
  },
];

describe('payout stage precedence (MYK9-1985)', () => {
  it.each(CASES)('$name', ({ row, accountState = 'enabled', now = AFTER_SHOW, text }) => {
    const stage = resolvePayoutStage({
      figures: toClubShowPayoutFigures(row),
      accountState,
      schedule: SCHEDULE,
      now,
    });
    expect(stage.text).toBe(text);
  });
});
