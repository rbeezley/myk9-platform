/**
 * The once-only "paid" confirmation strip and its device-local seen marker
 * (D6) — a sibling of `features/result-card/resultRevealSeen.ts`, same shape,
 * same guarded storage, distinct prefix.
 *
 * Device-local on purpose: a payment recorded while the exhibitor was elsewhere
 * still confirms on their next visit from any device, until they dismiss it
 * there. Nothing here touches the network, so it works at the show.
 *
 * @module MyEntriesPage/modules/paidStripSeen
 */

import { PaymentStatus } from '@/types/show-registration-types';
import { isPastShowEntry } from './myEntriesStats.helpers';
import type { MyEntry } from './my-entries-types';

const PREFIX = 'myk9:paid-strip-seen:';

/**
 * How long after payment the confirmation strip stays useful.
 *
 * The seen marker is device-local, so without a recency window a phone the
 * exhibitor has never opened My Shows on would greet them with one strip per
 * show they paid for months ago — the opposite of "shows once, then retires".
 */
export const PAID_STRIP_WINDOW_DAYS = 14;

const PAID_STRIP_WINDOW_MS = PAID_STRIP_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export function hasSeenPaidStrip(orderId: string): boolean {
  try {
    return localStorage.getItem(`${PREFIX}${orderId}`) === '1';
  } catch {
    // Storage can be unavailable in private browsing or locked-down contexts.
    return false;
  }
}

export function markPaidStripSeen(orderId: string): void {
  try {
    localStorage.setItem(`${PREFIX}${orderId}`, '1');
  } catch {
    // Same: the strip is dismissed in memory for this page load either way.
  }
}

/**
 * ONE strip per show, folding every recently paid, not-yet-dismissed order at
 * that show together. One strip per ORDER was the first cut, and the browser
 * walk on the seeded exhibitor rendered 255 of them: a show entered through
 * many orders must still say "you're paid here" exactly once.
 */
export interface PaidStrip {
  /** Every order the strip confirms; Dismiss retires them all. */
  orderIds: string[];
  /** Dogs the payments covered, in card order, each once. */
  dogNames: string[];
  /** What was paid across those orders, in cents. */
  amountCents: number;
  /**
   * When it was paid: the LATEST `submittedAt` among the folded orders. An
   * online order is paid at checkout, so submission IS the payment moment.
   * `lastUpdated` was the first choice and is wrong for this: it moves with
   * every later write (a check-in, a score, a secretary edit), so a show-day
   * update turned every paid order back into a fresh confirmation.
   */
  date: Date;
}

/**
 * Whether an order's money arrived through the ONLINE cart. Cash, check,
 * secretary-recorded and waived orders never produce a strip: there was no
 * checkout to confirm, and no receipt email to point at.
 */
function isPaidOnline(order: MyEntry): boolean {
  return order.paymentStatus === PaymentStatus.PAID_ONLINE;
}

/** Was this payment recent enough to still be worth confirming? */
function isWithinWindow(order: MyEntry, now: Date): boolean {
  return now.getTime() - order.submittedAt.getTime() <= PAID_STRIP_WINDOW_MS;
}

/**
 * The paid strip a show group should render right now, or null.
 *
 * @param orders The show group's orders.
 * @param hasSeen Injected so the pure derivation stays testable and the caller
 *   can keep an in-memory dismissal set alongside the stored one.
 */
export function derivePaidStrip(
  orders: MyEntry[],
  now: Date,
  hasSeen: (orderId: string) => boolean
): PaidStrip | null {
  const fresh = orders.filter(
    order =>
      isPaidOnline(order) &&
      isWithinWindow(order, now) &&
      !isPastShowEntry(order, now) &&
      !hasSeen(order.id)
  );
  if (fresh.length === 0) return null;

  const dogNames: string[] = [];
  for (const order of fresh) {
    const names = order.dogs.length > 0 ? order.dogs.map(dog => dog.dogName) : [order.dogName];
    for (const name of names) if (!dogNames.includes(name)) dogNames.push(name);
  }
  return {
    orderIds: fresh.map(order => order.id),
    dogNames,
    amountCents: fresh.reduce((sum, order) => sum + Math.round(order.totalFee * 100), 0),
    date: fresh.reduce(
      (latest, order) => (order.submittedAt > latest ? order.submittedAt : latest),
      fresh[0].submittedAt
    ),
  };
}
