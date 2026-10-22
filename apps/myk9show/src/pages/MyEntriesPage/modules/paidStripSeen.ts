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

import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { isPastShowEntry } from './myEntriesStats.helpers';
import type { EntryStatusKind } from '@/services/entryDisplay/entryDisplaySelectors';
import type { MyPayment } from '@/features/payments/useMyPayments';
import type { EntryClass, MyEntry } from './my-entries-types';

/**
 * The slice of a My Payments ledger row the strip reads. `MyPayment` is the
 * one producer, so the strip and the My Payments history quote the SAME
 * `stripe_orders` row: its amount, its date, its covered entries (MYK9-1275).
 */
export type PaidStripPayment = Pick<
  MyPayment,
  'id' | 'status' | 'date' | 'amountCents' | 'entryIds'
>;

/** The one `stripe_orders.status` that means the charge settled. */
const SETTLED_ORDER_STATUS = 'succeeded';

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

/** Day-of progress kinds: the secretary has already accepted these entries. */
const PAST_DECISION_KINDS: ReadonlySet<EntryStatusKind> = new Set([
  'in_ring',
  'completed',
  'absent',
  // Removed rows (incl. a cancelled show, whose kind is forced to withdrawn
  // while entryStatus stays PENDING): nothing left for the secretary to decide.
  // Not 'not_accepted': promotion-expired classifies there but stays PENDING.
  'withdrawn',
  'scratched',
]);

/** UI statuses that still wait on the secretary: pending, waitlisted, move-up requested. */
const AWAITING_STATUSES: ReadonlySet<EntryStatus> = new Set([
  EntryStatus.PENDING,
  EntryStatus.WAITLIST,
  EntryStatus.MOVE_UP_REQUESTED,
]);

/**
 * Whether an entry row still waits on the secretary's decision.
 *
 * `entryStatus` is `mapEntryStatus(raw entry_status)`, which keeps `paid` and
 * `promotion-expired` PENDING (payment is not acceptance); the display kind
 * alone would call a freshly paid entry accepted. The kind is read only to
 * rule out day-of progress, which `mapEntryStatus` also buckets as PENDING
 * (`checked-in`, or a `check_in_status` of in-ring).
 */
export function isAwaitingSecretaryDecision(
  entryStatus: EntryStatus | undefined,
  kind: EntryStatusKind
): boolean {
  if (!entryStatus || !AWAITING_STATUSES.has(entryStatus)) return false;
  return !PAST_DECISION_KINDS.has(kind);
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
  /**
   * What was paid, in cents: the sum of the covering online orders'
   * `amount_cents`, each counted once, exactly as My Payments lists them.
   */
  amountCents: number;
  /** How many class rows the payment covers (one row is one dog in one class). */
  classCount: number;
  /**
   * True while any covered row still waits on the secretary's decision. The
   * strip says "will review it next" only then; once every row is accepted
   * (or past acceptance: checked in, scored) that sentence would be stale.
   */
  awaitingReview: boolean;
  /**
   * When it was paid: the LATEST date among the covering online orders, the
   * same `paid_at ?? created_at` My Payments shows on each order's row. Never
   * `lastUpdated`, which moves with every later write (a check-in, a score).
   */
  date: Date;
}

/**
 * Whether this class row is still paid. Reads `rawPaymentStatus` (this row's
 * own `entries.payment_status`, never folded against the order's
 * registration) rather than `paymentStatus`: the folded value deliberately
 * downgrades a truly paid row to PENDING whenever a SIBLING entry on the same
 * registration still owes (MYK9-495's secretary-attention direction), which
 * dropped a genuinely paid class off this banner (MYK9-804 round 2).
 *
 * This alone does NOT mean the money came online: `mapPaymentStatus` maps the
 * generic DB `'paid'` to PAID_ONLINE (see `paymentChannel.ts`, F18), so a
 * secretary-marked check reads the same. The online fact is the covering
 * order from `settledOrdersByEntryId` below.
 */
function isStillPaid(cls: EntryClass): boolean {
  return groundTruthStatus(cls) === PaymentStatus.PAID_ONLINE;
}

interface SettledOrder {
  payment: PaidStripPayment;
  paidAt: Date;
}

/**
 * Every entry id a settled, recent online order covers. Cash, check,
 * secretary-recorded, waived and unknown-channel rows have no order, so they
 * never produce a strip: there was no checkout to confirm, and no receipt
 * email to point at.
 */
function settledOrdersByEntryId(
  payments: readonly PaidStripPayment[],
  now: Date
): Map<string, SettledOrder> {
  const byEntryId = new Map<string, SettledOrder>();
  for (const payment of payments) {
    if (payment.status.toLowerCase() !== SETTLED_ORDER_STATUS || !payment.date) continue;
    const paidAt = new Date(payment.date);
    if (Number.isNaN(paidAt.getTime())) continue;
    if (now.getTime() - paidAt.getTime() > PAID_STRIP_WINDOW_MS) continue;
    for (const entryId of payment.entryIds) byEntryId.set(entryId, { payment, paidAt });
  }
  return byEntryId;
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
 * @param payments The exhibitor's My Payments ledger (`useMyPayments`).
 *   `undefined` while it loads or when it cannot be read: no strip, since a
 *   payment the ledger does not show must not be claimed here (MYK9-1275).
 */
export function derivePaidStrip(
  orders: MyEntry[],
  now: Date,
  hasSeen: (paymentId: string) => boolean,
  payments: readonly PaidStripPayment[] | undefined
): PaidStrip | null {
  if (!payments || payments.length === 0) return null;
  interface FreshPayment {
    cls: EntryClass;
    dogName: string;
    settled: SettledOrder;
  }
  /** The slice `derivePaidStrip` actually reads off a dog — either the real
   * `MyEntryDogGroup` or the single-dog fallback for a hand-built fixture
   * that never populated `order.dogs`. */
  interface DogSlice {
    dogName: string;
    classes: EntryClass[];
  }

  const settledByEntryId = settledOrdersByEntryId(payments, now);
  const fresh: FreshPayment[] = [];
  for (const order of orders) {
    if (isPastShowEntry(order, now)) continue;
    const dogs: DogSlice[] =
      order.dogs.length > 0 ? order.dogs : [{ dogName: order.dogName, classes: order.classes }];
    for (const dog of dogs) {
      for (const cls of dog.classes) {
        const settled = settledByEntryId.get(cls.id);
        if (settled && isStillPaid(cls) && !hasSeen(cls.id)) {
          fresh.push({ cls, dogName: dog.dogName, settled });
        }
      }
    }
  }
  if (fresh.length === 0) return null;

  // Each covering order once: an order paying for seven classes is one charge
  // on My Payments, not seven.
  const coveringOrders = [
    ...new Map(fresh.map(payment => [payment.settled.payment.id, payment.settled])).values(),
  ];

  const dogNames: string[] = [];
  for (const payment of fresh) {
    if (!dogNames.includes(payment.dogName)) dogNames.push(payment.dogName);
  }
  return {
    paymentIds: fresh.map(payment => payment.cls.id),
    dogNames,
    classCount: fresh.length,
    awaitingReview: fresh.some(payment =>
      isAwaitingSecretaryDecision(payment.cls.entryStatus, payment.cls.entryStatusKind)
    ),
    amountCents: coveringOrders.reduce((sum, settled) => sum + settled.payment.amountCents, 0),
    date: coveringOrders.reduce(
      (latest, settled) => (settled.paidAt > latest ? settled.paidAt : latest),
      coveringOrders[0].paidAt
    ),
  };
}
