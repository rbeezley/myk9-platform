/**
 * One money state per show group, derived over the show's ORDERS (D5).
 *
 * Every figure here comes from the order balances the cart and My Payments
 * already read (`getOrderOnlinePrompt` / `getOrderPayAtShowPrompt` /
 * `MyEntryBalance`). This module never sums fees itself: the amount it reports
 * is the amount the cart will charge, which is the whole point of
 * exhibitor-money-clarity. Re-adding `cls.fee` here is how the page and the
 * cart start telling the exhibitor two different numbers.
 *
 * @module MyEntriesPage/modules/showMoneyState
 */

import { buildFinishPaymentHref } from '@/features/payments/finishPaymentHref';
import { getOrderOnlinePrompt, getOrderPayAtShowPrompt } from './myEntryOrderBalance';
import { isPastShowEntry } from './myEntriesStats.helpers';
import type { MyEntry } from './my-entries-types';

export type ShowMoneyKind = 'settled' | 'pay-at-show' | 'balance-due' | 'unresolved';

export interface ShowMoneyState {
  kind: ShowMoneyKind;
  /** Total the cart will charge for this show's unpaid orders. 0 when nothing is owed. */
  amountCents: number;
  /** Dogs the outstanding balance covers, in card order. Empty unless money is owed. */
  dueDogNames: string[];
  /** Existing cart deep link scoped to the owing entry rows, or null when none can be built. */
  paymentHref: string | null;
  /** Orders carrying the outstanding online balance. */
  dueOrderIds: string[];
}

/**
 * The online balance this order still owes, in cents — read from the same
 * balance the prompt quotes, never re-summed.
 *
 * The `balance`-less fallback is the documented partial-replication window,
 * where `getOrderOnlinePrompt` itself falls back to the order's own total.
 */
function onlineDueCentsOf(order: MyEntry): number {
  if (getOrderOnlinePrompt(order).kind !== 'finish-online') return 0;
  if (order.balance) return order.balance.onlineDueCents;
  return Math.round(order.totalFee * 100);
}

/**
 * The dogs whose OWN class rows still owe: a two-dog order paid for one dog
 * must not tell the exhibitor both dogs are waiting on payment (Codex review
 * on PR #2198). Falls back to every dog only when the balance carries no
 * row ids at all (the partial-replication window).
 */
function dueDogNamesOf(order: MyEntry): string[] {
  const dueIds = new Set(order.balance?.dueEntryIds ?? []);
  const dogs = order.dogs.length > 0 ? order.dogs : null;
  if (!dogs) return [order.dogName];
  if (dueIds.size === 0) return dogs.map(dog => dog.dogName);
  const due = dogs.filter(dog => dog.classes.some(cls => dueIds.has(cls.id)));
  return (due.length > 0 ? due : dogs).map(dog => dog.dogName);
}

/**
 * Derive the show's single money state.
 *
 * `balance-due` and `unresolved` are the same debt on either side of the show's
 * last day: the checkout endpoint rejects a past show, so past debt gets no
 * payment link and the strip tells the exhibitor to contact the club.
 */
export function deriveShowMoneyState(orders: MyEntry[], now: Date): ShowMoneyState {
  const dueOrders = orders.filter(order => onlineDueCentsOf(order) > 0);
  const amountCents = dueOrders.reduce((sum, order) => sum + onlineDueCentsOf(order), 0);

  if (dueOrders.length > 0) {
    // Every order in a group belongs to the same show, so any one of them
    // answers "is this show over?".
    const isPast = isPastShowEntry(dueOrders[0], now);
    const dueEntryIds = dueOrders.flatMap(order => order.balance?.dueEntryIds ?? []);
    const showId = dueOrders[0].showId;
    return {
      kind: isPast ? 'unresolved' : 'balance-due',
      amountCents,
      dueDogNames: [...new Set(dueOrders.flatMap(dueDogNamesOf))],
      paymentHref:
        isPast || !showId || dueEntryIds.length === 0
          ? null
          : buildFinishPaymentHref(showId, dueEntryIds),
      dueOrderIds: dueOrders.map(order => order.id),
    };
  }

  const kind: ShowMoneyKind = orders.some(
    order => getOrderPayAtShowPrompt(order).kind === 'pay-at-show'
  )
    ? 'pay-at-show'
    : 'settled';

  return { kind, amountCents: 0, dueDogNames: [], paymentHref: null, dueOrderIds: [] };
}

export type RefundKind = 'partial' | 'full';

export interface RefundNote {
  /** Refunded amount in cents. */
  amountCents: number;
  date: Date;
  kind: RefundKind;
}

/**
 * Refund notes keyed by `dogId`, from each DOG's own refund facts — never the
 * order's total. A two-dog order refunded for one dog must not tell the other
 * dog's owner money came back (Codex review on PR #2198). Full vs partial is
 * read against the dog's own class fees.
 *
 * `refundAmount` is in DOLLARS (it is compared against the entry fee in
 * `useMyEntriesData`), so it is converted here.
 */
export function refundNotesByDog(orders: MyEntry[]): Record<string, RefundNote> {
  const notes: Record<string, RefundNote> = {};
  for (const order of orders) {
    for (const dog of order.dogs) {
      const amount = dog.refundAmount ?? 0;
      if (amount <= 0 || !dog.refundedAt) continue;
      const feeTotal = dog.classes.reduce((sum, cls) => sum + cls.fee, 0);
      const prior = notes[dog.dogId];
      const merged: RefundNote = {
        amountCents: (prior?.amountCents ?? 0) + Math.round(amount * 100),
        date: prior && prior.date > dog.refundedAt ? prior.date : dog.refundedAt,
        kind: feeTotal > 0 && amount >= feeTotal ? 'full' : 'partial',
      };
      notes[dog.dogId] = merged;
    }
  }
  return notes;
}
