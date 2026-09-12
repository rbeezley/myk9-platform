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

export interface PaidStrip {
  orderId: string;
  /** Dogs the payment covered, in card order. */
  dogNames: string[];
  /** What was paid, in cents. */
  amountCents: number;
  /**
   * When it was paid. `MyEntry` carries no `paidAt`, so this is the order's
   * `lastUpdated` — the timestamp the payment write itself moved.
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
  return now.getTime() - order.lastUpdated.getTime() <= PAID_STRIP_WINDOW_MS;
}

/**
 * The paid strips a show group should render right now.
 *
 * @param hasSeen Injected so the pure derivation stays testable and the caller
 *   can keep an in-memory dismissal set alongside the stored one.
 */
export function derivePaidStrips(
  orders: MyEntry[],
  now: Date,
  hasSeen: (orderId: string) => boolean
): PaidStrip[] {
  return orders
    .filter(
      order =>
        isPaidOnline(order) &&
        isWithinWindow(order, now) &&
        !isPastShowEntry(order, now) &&
        !hasSeen(order.id)
    )
    .map(order => ({
      orderId: order.id,
      dogNames: order.dogs.length > 0 ? order.dogs.map(dog => dog.dogName) : [order.dogName],
      amountCents: Math.round(order.totalFee * 100),
      date: order.lastUpdated,
    }));
}
