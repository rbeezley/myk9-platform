/**
 * Row-level money reconciliation for a grouped My Shows order card.
 *
 * `groupEntriesByOrder` merges per-class rows into one card for DISPLAY. Money
 * must not be merged that way: assigning the order the first row's
 * `paymentStatus` is lossy and produced the "$150 due in the summary vs a Paid
 * card with no pay action" contradiction (exhibitor-money-clarity). Everything
 * money-shaped on the card — its status, its amount, and its pay link — is
 * derived here from the SAME per-class rows, through the SAME
 * `summarizeEntryBalances` selector the page summary and My Payments use.
 *
 * @module MyEntriesPage/modules/myEntryOrderBalance
 */

import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import {
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

export interface OrderBalanceContext {
  showId: string;
  showName: string;
  showDate: Date;
  showEndDate?: Date | undefined;
  /** Order-level entry status, used when a class row carries none. */
  entryStatus: EntryStatus;
  /** Order-level payment status/method, used when a class row carries none. */
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
    paymentMethod: cls.paymentMethod ?? ctx.paymentMethod,
    totalFee: cls.fee,
  }));
}

/**
 * Reconcile an order's payment status across its rows.
 *
 * Precedence, deliberately conservative: a partially-paid order is NOT "paid".
 * Any row still PENDING makes the whole order pending, because the exhibitor
 * still owes something. Only when nothing is pending do we surface a settled
 * status (a real PAID_* if one exists, else the first row's — waived/refunded).
 */
export function reconcileOrderPaymentStatus(sources: EntryBalanceSource[]): PaymentStatus | null {
  if (sources.length === 0) return null;
  if (sources.some(source => source.paymentStatus === PaymentStatus.PENDING)) {
    return PaymentStatus.PENDING;
  }
  const paid = sources.find(source => PAID_STATUSES.includes(source.paymentStatus));
  return paid ? paid.paymentStatus : sources[0].paymentStatus;
}

function reconcileOrderPaymentMethod(sources: EntryBalanceSource[]): string | null {
  const pending = sources.find(source => source.paymentStatus === PaymentStatus.PENDING);
  const chosen = pending ?? sources[0];
  return chosen?.paymentMethod ?? null;
}

function feeCents(feeDollars: number): number {
  return Math.max(0, Math.round(feeDollars * 100));
}

/**
 * Build the order's money slice from its per-class rows.
 */
export function buildOrderBalance(
  classes: EntryClass[],
  ctx: OrderBalanceContext,
  now: Date = new Date()
): MyEntryBalance {
  const sources = toBalanceSources(classes, ctx);
  const summary = summarizeEntryBalances(sources, now);
  const onlineShow = summary.onlineShowBalances[0];
  const unpaidFeeCents = sources
    .filter(source => source.paymentStatus === PaymentStatus.PENDING)
    .reduce((sum, source) => sum + feeCents(source.totalFee), 0);

  return {
    paymentStatus: reconcileOrderPaymentStatus(sources) ?? ctx.paymentStatus,
    paymentMethod: reconcileOrderPaymentMethod(sources) ?? ctx.paymentMethod,
    unpaidFeeCents,
    amountDueCents: summary.amountDueCents,
    onlineDueCents: summary.onlineDueCents,
    payAtShowDueCents: summary.payAtShowDueCents,
    dueEntryIds: onlineShow?.entryIds ?? [],
  };
}

/**
 * The card's payment prompt, derived from the row-level balance rather than
 * the (lossy) grouped status + whole-order fee. A mixed order prompts for what
 * is actually still owed, not the full order total.
 */
export function getOrderPaymentPrompt(entry: MyEntry): EntryPaymentPrompt {
  const balance = entry.balance;
  return getEntryPaymentPrompt({
    paymentMethod: balance?.paymentMethod ?? entry.paymentMethod,
    paymentStatus: balance?.paymentStatus ?? entry.paymentStatus,
    totalFee: balance ? balance.unpaidFeeCents / 100 : entry.totalFee,
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
