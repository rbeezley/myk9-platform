/**
 * Row-level money reconciliation for a grouped My Shows order card.
 *
 * `groupEntriesByOrder` merges per-class rows into one card for DISPLAY. Money
 * must not be merged that way: assigning the order the first row's
 * `paymentStatus` is lossy and produced the "$150 due in the summary vs a Paid
 * card with no pay action" contradiction (exhibitor-money-clarity).
 *
 * Everything money-shaped on the card is derived here from the SAME per-class
 * rows, through the SAME `summarizeEntryBalances` selector the page summary and
 * My Payments use — including its eligibility rule (`isCurrentSummaryEntry`).
 * Re-implementing eligibility here is what let a withdrawn-but-pending sibling
 * make a card offer payment while the summary said $0 due.
 *
 * @module MyEntriesPage/modules/myEntryOrderBalance
 */

import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import {
  isCurrentSummaryEntry,
  summarizeEntryBalances,
  type EntryBalanceSource,
} from '@/features/payments/entryBalanceSummary';
import {
  getEntryPaymentPrompt,
  type EntryPaymentPrompt,
} from '@/features/payments/entryPaymentPrompt';
import { buildFinishPaymentHref } from '@/features/payments/finishPaymentHref';
import type { EntryClass, MyEntry, MyEntryBalance } from './my-entries-types';

/** Statuses that mean the money actually arrived. */
const PAID_STATUSES: PaymentStatus[] = [
  PaymentStatus.PAID_ONLINE,
  PaymentStatus.PAID_BY_CHECK,
  PaymentStatus.PAID_BY_CASH,
];

/** Methods the exhibitor settles in person rather than online. */
const PAY_AT_SHOW_METHODS = new Set(['cash', 'check']);

export interface OrderBalanceContext {
  showId: string;
  showName: string;
  showDate: Date;
  showEndDate?: Date | undefined;
  entryStatus: EntryStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
}

function toBalanceSources(classes: EntryClass[], ctx: OrderBalanceContext): EntryBalanceSource[] {
  return classes.map(cls => ({
    id: cls.id,
    showId: ctx.showId,
    showName: ctx.showName,
    showDate: ctx.showDate,
    showEndDate: ctx.showEndDate,
    entryStatus: cls.entryStatus ?? ctx.entryStatus,
    paymentStatus: cls.paymentStatus ?? ctx.paymentStatus,
    // `null` is meaningful here (an explicit unresolved-online payment) and
    // must not be overwritten by a paid sibling's method — only fall back
    // to the order context when the row never carried the field at all.
    paymentMethod: cls.paymentMethod !== undefined ? cls.paymentMethod : ctx.paymentMethod,
    totalFee: cls.fee,
  }));
}

/**
 * Reconcile an order's payment status across the rows the selector counts.
 *
 * Precedence, deliberately conservative:
 *  1. any eligible row still PENDING -> PENDING (a partly paid order is not paid)
 *  2. a mix of refunded and paid rows -> PARTIAL_REFUND (a partial withdrawal;
 *     calling it "Paid" would expose a full-order receipt for money returned)
 *  3. all refunded -> REFUNDED
 *  4. otherwise a real paid status if present, else the first row's
 */
export function reconcileOrderPaymentStatus(eligible: EntryBalanceSource[]): PaymentStatus | null {
  if (eligible.length === 0) return null;
  if (eligible.some(source => source.paymentStatus === PaymentStatus.PENDING)) {
    return PaymentStatus.PENDING;
  }

  // A row can already carry PARTIAL_REFUND directly (not just a mix of
  // REFUNDED + paid rows) — check that before falling through to the paid
  // status, or a paid sibling silently wins and the card offers its receipt.
  if (eligible.some(source => source.paymentStatus === PaymentStatus.PARTIAL_REFUND)) {
    return PaymentStatus.PARTIAL_REFUND;
  }

  const refunded = eligible.filter(source => source.paymentStatus === PaymentStatus.REFUNDED);
  const paid = eligible.filter(source => PAID_STATUSES.includes(source.paymentStatus));
  if (refunded.length > 0) {
    if (paid.length > 0) return PaymentStatus.PARTIAL_REFUND;
    if (refunded.length === eligible.length) return PaymentStatus.REFUNDED;
  }

  return paid[0]?.paymentStatus ?? eligible[0].paymentStatus;
}

/**
 * Build the order's money slice from its per-class rows, or `null` when there
 * is nothing trustworthy to build from.
 *
 * Returning null matters during the documented partial-replication window: an
 * entry can render before its class relation arrives, leaving `classes: []`
 * while the top-level row still carries a fee and a pending status. A zeroed
 * balance would suppress the card's Payment Due and its recovery action while
 * the raw-row page summary still reported the debt — so callers keep their
 * top-level fallback instead.
 */
export function buildOrderBalance(
  classes: EntryClass[],
  ctx: OrderBalanceContext,
  now: Date = new Date()
): MyEntryBalance | null {
  const sources = toBalanceSources(classes, ctx);
  if (sources.length === 0) return null;

  const eligible = sources.filter(source => isCurrentSummaryEntry(source, now));
  const summary = summarizeEntryBalances(sources, now);
  const onlineShow = summary.onlineShowBalances[0];

  // The pay-at-show instruction must quote only the in-person portion and name
  // the method of the rows that actually carry it — a mixed cash+online order
  // previously told the exhibitor to bring the combined total in cash.
  const payAtShowSource = eligible.find(
    source =>
      source.paymentStatus === PaymentStatus.PENDING &&
      PAY_AT_SHOW_METHODS.has(source.paymentMethod ?? '')
  );

  return {
    paymentStatus: reconcileOrderPaymentStatus(eligible) ?? ctx.paymentStatus,
    paymentMethod: payAtShowSource?.paymentMethod ?? ctx.paymentMethod,
    amountDueCents: summary.amountDueCents,
    onlineDueCents: summary.onlineDueCents,
    payAtShowDueCents: summary.payAtShowDueCents,
    payAtShowMethod: payAtShowSource?.paymentMethod ?? null,
    dueEntryIds: onlineShow?.entryIds ?? [],
  };
}

/**
 * The card's ONLINE payment prompt, quoting only the online portion.
 *
 * Amounts come from the selector's eligible balances, so a withdrawn or
 * rejected sibling that is still "pending" never conjures a Finish Payment
 * action the page summary disagrees with.
 */
export function getOrderOnlinePrompt(entry: MyEntry): EntryPaymentPrompt {
  const balance = entry.balance;
  if (!balance) {
    return getEntryPaymentPrompt({
      paymentMethod: entry.paymentMethod,
      paymentStatus: entry.paymentStatus,
      totalFee: entry.totalFee,
    });
  }
  if (balance.onlineDueCents <= 0) return { kind: 'none' };
  return getEntryPaymentPrompt({
    paymentMethod: 'credit_card',
    paymentStatus: PaymentStatus.PENDING,
    totalFee: balance.onlineDueCents / 100,
  });
}

/**
 * The card's PAY-AT-SHOW instruction, quoting only the in-person portion.
 * Independent of the online prompt so a mixed-method order shows both truths.
 */
export function getOrderPayAtShowPrompt(entry: MyEntry): EntryPaymentPrompt {
  const balance = entry.balance;
  // Same partial-replication fallback as the online prompt: with no class rows
  // there is no balance to slice, and the entry's own pending cash/check
  // instruction must not vanish.
  if (!balance) {
    const prompt = getEntryPaymentPrompt({
      paymentMethod: entry.paymentMethod,
      paymentStatus: entry.paymentStatus,
      totalFee: entry.totalFee,
    });
    return prompt.kind === 'pay-at-show' ? prompt : { kind: 'none' };
  }
  if (balance.payAtShowDueCents <= 0) return { kind: 'none' };
  return getEntryPaymentPrompt({
    paymentMethod: balance.payAtShowMethod,
    paymentStatus: PaymentStatus.PENDING,
    totalFee: balance.payAtShowDueCents / 100,
  });
}

/**
 * Pay link for an order card. Targets ONLY the entry rows that actually owe an
 * online balance — never the whole order, which would re-charge paid rows.
 */
export function buildOrderPaymentHref(entry: MyEntry): string {
  const dueIds = entry.balance?.dueEntryIds ?? [];
  if (dueIds.length > 0) return buildFinishPaymentHref(entry.showId, dueIds);
  // EntryClass.id is the underlying entries-row id in useMyEntriesData.
  const classIds = entry.classes.map(cls => cls.id).filter(Boolean);
  return buildFinishPaymentHref(entry.showId, classIds.length > 0 ? classIds : [entry.id]);
}
