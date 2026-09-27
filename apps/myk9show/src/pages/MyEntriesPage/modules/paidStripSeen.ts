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
import type { EntryClass, MyEntry } from './my-entries-types';

const PREFIX = 'myk9:paid-strip-seen:';

/** This class row's ground-truth payment status — see `EntryClass.rawPaymentStatus`. */
function groundTruthStatus(cls: EntryClass): PaymentStatus | undefined {
  return cls.rawPaymentStatus ?? cls.paymentStatus;
}

/**
 * How long after payment the confirmation strip stays useful.
 *
 * The seen marker is device-local, so without a recency window a phone the
 * exhibitor has never opened My Shows on would greet them with one strip per
 * show they paid for months ago — the opposite of "shows once, then retires".
 */
export const PAID_STRIP_WINDOW_DAYS = 14;

const PAID_STRIP_WINDOW_MS = PAID_STRIP_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export function hasSeenPaidStrip(paymentId: string): boolean {
  try {
    return localStorage.getItem(`${PREFIX}${paymentId}`) === '1';
  } catch {
    // Storage can be unavailable in private browsing or locked-down contexts.
    return false;
  }
}

export function markPaidStripSeen(paymentId: string): void {
  try {
    localStorage.setItem(`${PREFIX}${paymentId}`, '1');
  } catch {
    // Same: the strip is dismissed in memory for this page load either way.
  }
}

/**
 * ONE strip per show, folding every recently paid, not-yet-dismissed PAYMENT
 * (class row) at that show together. One strip per ORDER was the first cut,
 * and the browser walk on the seeded exhibitor rendered 255 of them: a show
 * entered through many orders must still say "you're paid here" exactly
 * once. Tracking per ORDER was the second cut (MYK9-804 round 1): an order
 * that mixes a paid class with a still-pending sibling dismissed or confirmed
 * both together, so the granularity dropped again to the individual row.
 */
export interface PaidStrip {
  /** Every class row the strip confirms; Dismiss retires them all. */
  paymentIds: string[];
  /** Dogs the payments covered, in card order, each once. */
  dogNames: string[];
  /** What was paid across those rows, in cents. */
  amountCents: number;
  /**
   * When it was paid: the LATEST `submittedAt` among the orders that
   * contributed a fresh row. An online order is paid at checkout, so
   * submission IS the payment moment. `lastUpdated` was the first choice and
   * is wrong for this: it moves with every later write (a check-in, a score,
   * a secretary edit), so a show-day update turned every paid order back into
   * a fresh confirmation.
   */
  date: Date;
}

/**
 * Whether a class row's money arrived through the ONLINE cart. Cash, check,
 * secretary-recorded and waived rows never produce a strip: there was no
 * checkout to confirm, and no receipt email to point at.
 *
 * Reads `rawPaymentStatus` (this row's own `entries.payment_status`, never
 * folded against the order's registration) rather than `paymentStatus` — the
 * folded value deliberately downgrades a truly paid row to PENDING whenever a
 * SIBLING entry on the same registration still owes (MYK9-495's
 * secretary-attention direction), which dropped a genuinely paid class off
 * this banner (MYK9-804 round 2).
 */
function isPaidOnline(cls: EntryClass): boolean {
  return groundTruthStatus(cls) === PaymentStatus.PAID_ONLINE;
}

/** Was this payment recent enough to still be worth confirming? */
function isWithinWindow(order: MyEntry, now: Date): boolean {
  return now.getTime() - order.submittedAt.getTime() <= PAID_STRIP_WINDOW_MS;
}

/**
 * The paid strip a show group should render right now, or null.
 *
 * @param orders The show's FULL, unfiltered order set — never the page's
 *   filtered `group.orders`, or the total shifts with the When/Status filters
 *   (MYK9-804 round 2). Money math still runs per CLASS ROW within each
 *   order (`order.dogs[].classes`), so a mixed-payment order counts only its
 *   own paid rows.
 * @param hasSeen Injected so the pure derivation stays testable and the
 *   caller can keep an in-memory dismissal set, keyed by class row id,
 *   alongside the stored one.
 */
export function derivePaidStrip(
  orders: MyEntry[],
  now: Date,
  hasSeen: (paymentId: string) => boolean
): PaidStrip | null {
  interface FreshPayment {
    cls: EntryClass;
    dogName: string;
    order: MyEntry;
  }
  /** The slice `derivePaidStrip` actually reads off a dog — either the real
   * `MyEntryDogGroup` or the single-dog fallback for a hand-built fixture
   * that never populated `order.dogs`. */
  interface DogSlice {
    dogName: string;
    classes: EntryClass[];
  }

  const fresh: FreshPayment[] = [];
  for (const order of orders) {
    if (isPastShowEntry(order, now) || !isWithinWindow(order, now)) continue;
    const dogs: DogSlice[] =
      order.dogs.length > 0 ? order.dogs : [{ dogName: order.dogName, classes: order.classes }];
    for (const dog of dogs) {
      for (const cls of dog.classes) {
        if (isPaidOnline(cls) && !hasSeen(cls.id)) {
          fresh.push({ cls, dogName: dog.dogName, order });
        }
      }
    }
  }
  if (fresh.length === 0) return null;

  const dogNames: string[] = [];
  for (const payment of fresh) {
    if (!dogNames.includes(payment.dogName)) dogNames.push(payment.dogName);
  }
  return {
    paymentIds: fresh.map(payment => payment.cls.id),
    dogNames,
    amountCents: fresh.reduce((sum, payment) => sum + Math.round(payment.cls.fee * 100), 0),
    date: fresh.reduce(
      (latest, payment) => (payment.order.submittedAt > latest ? payment.order.submittedAt : latest),
      fresh[0].order.submittedAt
    ),
  };
}
