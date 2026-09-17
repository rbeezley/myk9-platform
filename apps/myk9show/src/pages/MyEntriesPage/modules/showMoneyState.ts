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
// The gate is a PURE predicate, so it is imported from its own module rather
// than the `entries` barrel: a unit test that mocks the barrel's data-access
// functions must not thereby stub out the rule that withholds money.
import {
  isMoneyConfirmed,
  type UserEntriesSource,
} from '@/services/database/entries/userEntriesRead';
import { getOrderOnlinePrompt, getOrderPayAtShowPrompt } from './myEntryOrderBalance';
import { isPastShowEntry } from './myEntriesStats.helpers';
import type { MyEntry } from './my-entries-types';

/**
 * `unknown` is not "nothing owed" and not an error: it is the state where the
 * rows these orders came from were never confirmed by the server, so THIS
 * MODULE refuses to say anything about money. Every strip, meta word, cart link
 * and pay button on My Shows renders from this kind alone — no surface reads
 * the row source for money itself (MYK9-629 restructure 1).
 */
export type ShowMoneyKind = 'settled' | 'pay-at-show' | 'balance-due' | 'unresolved' | 'unknown';

/**
 * The single value a show group renders money from when the rows are
 * unconfirmed. Every figure is empty, so a surface that forgets to branch on
 * `kind` shows nothing rather than a wrong number — the failure mode points the
 * safe way.
 */
export const UNKNOWN_SHOW_MONEY_STATE: ShowMoneyState = {
  kind: 'unknown',
  amountCents: 0,
  dueDogNames: [],
  paymentHref: null,
  dueOrderIds: [],
};

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
export function deriveShowMoneyState(
  orders: MyEntry[],
  now: Date,
  source: UserEntriesSource
): ShowMoneyState {
  // The gate lives HERE, at the one derivation, and nowhere else. A caller that
  // asked the source itself is how PR #2301's P1 survived two rounds inside a
  // third strip on the same page.
  if (!isMoneyConfirmed(source)) return UNKNOWN_SHOW_MONEY_STATE;

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

/**
 * `unknown` is the unconfirmed source's refund kind. Both `partial` and `full`
 * are CLAIMS derived from the dog's own class fees, and this module is no more
 * entitled to make them from unconfirmed rows than it is to state an amount.
 */
export type RefundKind = 'partial' | 'full' | 'unknown';

export interface RefundNote {
  /**
   * Refunded amount in cents, or `null` when the rows were never confirmed.
   * Nullable rather than zero: a refund of $0.00 is a different sentence from
   * a refund whose amount we cannot vouch for, and only one of them is true.
   */
  amountCents: number | null;
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
export function refundNotesByDog(
  orders: MyEntry[],
  source: UserEntriesSource
): Record<string, RefundNote> {
  // A refund note prints a dollar figure on the dog card, directly beneath the
  // strip that says amounts are hidden. Decision (a) exempts the RECEIPT — a
  // document of a payment already taken — not every figure derived from an
  // unconfirmed row, so this goes through the same gate as every other amount.
  const confirmed = isMoneyConfirmed(source);
  // Aggregate first, classify last: a dog refunded on two orders is "fully"
  // refunded only against the fees of BOTH orders (Codex review on PR #2198).
  const totals: Record<string, { amountCents: number; feeCents: number; date: Date }> = {};
  for (const order of orders) {
    for (const dog of order.dogs) {
      const amount = dog.refundAmount ?? 0;
      if (amount <= 0 || !dog.refundedAt) continue;
      const feeCents = dog.classes.reduce((sum, cls) => sum + Math.round(cls.fee * 100), 0);
      const prior = totals[dog.dogId];
      totals[dog.dogId] = {
        amountCents: (prior?.amountCents ?? 0) + Math.round(amount * 100),
        feeCents: (prior?.feeCents ?? 0) + feeCents,
        date: prior && prior.date > dog.refundedAt ? prior.date : dog.refundedAt,
      };
    }
  }
  const notes: Record<string, RefundNote> = {};
  for (const [dogId, total] of Object.entries(totals)) {
    notes[dogId] = confirmed
      ? {
          amountCents: total.amountCents,
          date: total.date,
          kind: total.feeCents > 0 && total.amountCents >= total.feeCents ? 'full' : 'partial',
        }
      : // The note survives — "a refund happened" is not a money claim and is
        // the fact the exhibitor most needs — but its amount and its
        // partial/full classification do not.
        { amountCents: null, date: total.date, kind: 'unknown' };
  }
  return notes;
}
