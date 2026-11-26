/**
 * MYK9-1985: what a club reads for a show, end to end from the reconciliation
 * rows. Whether anything is owed is decided ONCE (deriveShowOwed, in
 * buildClubShowReconciliationRows) and resolvePayoutStage reads only that.
 *
 * Precedence, top to bottom:
 *   1. a completed payout with money: Sent (money moved, whatever came after)
 *   2. nothing owed, refunded: Nothing to send (refunded)
 *   3. nothing owed, no fees: Nothing to send (no online entry fees)
 *   4. a club-account failure: Fix it
 *   5. everything else, unchanged
 */
import { describe, it, expect } from 'vitest';
import { resolvePayoutStage } from '@/features/payments/payoutStage';
import type { PayoutsAccountState } from '@/features/payments/payoutBadge';
import { buildClubShowReconciliationRows } from './clubShowReconciliation';
import type {
  FinancialReconciliationOrder,
  FinancialReconciliationPayout,
} from './financialReconciliation';

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
const PAID_BY = 'Paid by December 16.';
const PLATFORM =
  "We couldn't send this. We're on it, and you don't need to do anything. Paid by December 16.";
const DELAYED = "Your payout is taking longer than usual. We'll be in touch by email.";

function order(
  overrides: Partial<FinancialReconciliationOrder> = {}
): FinancialReconciliationOrder {
  return {
    orderId: 'order-1',
    showId: 'show-1',
    showName: 'Cedar Valley Classic',
    status: 'succeeded',
    orderType: 'entry',
    amountCents: 5350,
    entrySubtotalCents: 5000,
    platformFeeCents: 350,
    platformFeeRate: 0.07,
    stripeProcessingFeeCents: 185,
    refundedCents: 0,
    makeWholeRefundedCents: 0,
    stripePaymentIntentId: 'pi_1',
    createdAt: '2026-11-01T00:00:00Z',
    paidAt: '2026-11-01T00:00:00Z',
    refundedAt: null,
    ...overrides,
  };
}

function payoutRow(
  status: string,
  overrides: Partial<FinancialReconciliationPayout> = {}
): FinancialReconciliationPayout {
  return {
    payoutId: 'payout-1',
    showId: 'show-1',
    showName: 'Cedar Valley Classic',
    status,
    amountCents: 5000,
    stripeTransferId: null,
    scheduledDate: null,
    completedAt: status === 'completed' ? '2026-12-12T15:00:00Z' : null,
    failureReason: null,
    createdAt: '2026-12-12T08:00:00Z',
    ...overrides,
  };
}

const ALL_REFUNDED = order({ refundedCents: 5000, refundedAt: '2026-12-10T00:00:00Z' });
const ZERO_FEES = order({ amountCents: 0, entrySubtotalCents: 0, platformFeeCents: 0 });
const FEE_PENDING = order({ stripeProcessingFeeCents: null });
const CLUB_FAILURE = 'club_account:account_closed: The bank account is closed';

interface Case {
  name: string;
  orders: FinancialReconciliationOrder[];
  payouts: FinancialReconciliationPayout[];
  accountState?: PayoutsAccountState;
  now?: Date;
  text: string;
}

const CASES: Case[] = [
  // 1. Money moved.
  { name: 'a sent payout', orders: [order()], payouts: [payoutRow('completed')], text: SENT },
  {
    name: 'a sent payout whose fees were refunded later still reads Sent',
    orders: [ALL_REFUNDED],
    payouts: [payoutRow('completed')],
    text: SENT,
  },
  // 2. Nothing owed, refunded.
  {
    name: 'a fully refunded show with no payout row',
    orders: [ALL_REFUNDED],
    payouts: [],
    text: REFUNDED,
  },
  {
    name: 'a $0 completed close-out row of a refunded show',
    orders: [ALL_REFUNDED],
    payouts: [payoutRow('completed', { amountCents: 0 })],
    text: REFUNDED,
  },
  {
    name: '(b) a club-account failure whose fees were then refunded: no Fix it forever',
    orders: [ALL_REFUNDED],
    payouts: [payoutRow('failed', { failureReason: CLUB_FAILURE })],
    text: REFUNDED,
  },
  {
    name: 'a $0 failed row of a refunded show',
    orders: [ALL_REFUNDED],
    payouts: [payoutRow('failed', { amountCents: 0, failureReason: 'Stripe rate limit' })],
    text: REFUNDED,
  },
  {
    name: 'a fully refunded show past the due date is not delayed',
    orders: [ALL_REFUNDED],
    payouts: [],
    now: PAST_DUE,
    text: REFUNDED,
  },
  // 3. Nothing owed, no fees.
  {
    name: '(a) a known $0 net, no refunds, no payout row: no "Paid by"',
    orders: [ZERO_FEES],
    payouts: [],
    text: NO_FEES,
  },
  {
    name: '(a) the same show without a bank account: no "Connect bank account"',
    orders: [ZERO_FEES],
    payouts: [],
    accountState: 'not-enabled',
    text: NO_FEES,
  },
  {
    name: '(a) the same show past the due date: not delayed',
    orders: [ZERO_FEES],
    payouts: [],
    now: PAST_DUE,
    text: NO_FEES,
  },
  {
    name: 'a $0 pending row with no bank account and no refunds',
    orders: [ZERO_FEES],
    payouts: [payoutRow('pending', { amountCents: 0 })],
    accountState: 'not-enabled',
    text: NO_FEES,
  },
  // 4. The club's to fix.
  {
    name: 'a club-account failure with money still owed',
    orders: [order()],
    payouts: [payoutRow('failed', { failureReason: CLUB_FAILURE })],
    text: FIX,
  },
  {
    name: 'a club-account failure past the due date keeps its fix',
    orders: [order()],
    payouts: [payoutRow('failed', { failureReason: CLUB_FAILURE })],
    now: PAST_DUE,
    text: FIX,
  },
  // 5. Everything else.
  {
    name: 'money owed, no bank account',
    orders: [order()],
    payouts: [],
    accountState: 'not-enabled',
    text: BANK,
  },
  { name: 'money owed, no payout row yet', orders: [order()], payouts: [], text: PAID_BY },
  {
    name: 'money owed, waiting for approval',
    orders: [order()],
    payouts: [payoutRow('awaiting_approval')],
    text: CHECKING,
  },
  {
    name: 'a live payout with money is owed even when the orders net to $0',
    orders: [ZERO_FEES],
    payouts: [payoutRow('awaiting_approval')],
    text: CHECKING,
  },
  {
    name: 'a platform failure with money owed',
    orders: [order()],
    payouts: [payoutRow('failed', { failureReason: 'Stripe rate limit' })],
    text: PLATFORM,
  },
  {
    name: 'an unreadable net is treated as owed',
    orders: [FEE_PENDING],
    payouts: [],
    text: PAID_BY,
  },
  {
    name: 'an unreadable net past the due date is delayed',
    orders: [FEE_PENDING],
    payouts: [payoutRow('awaiting_approval')],
    now: PAST_DUE,
    text: DELAYED,
  },
];

describe('payout stage precedence (MYK9-1985)', () => {
  it.each(CASES)(
    '$name',
    ({ orders, payouts, accountState = 'enabled', now = AFTER_SHOW, text }) => {
      const [row] = buildClubShowReconciliationRows(orders, payouts, accountState);
      expect(row).toBeDefined();
      const stage = resolvePayoutStage({
        payout: row!.settlement,
        owed: row!.owed,
        accountState,
        schedule: SCHEDULE,
        now,
      });
      expect(stage.text).toBe(text);
    }
  );
});
