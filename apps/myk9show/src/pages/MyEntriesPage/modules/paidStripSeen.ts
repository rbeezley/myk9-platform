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

/**
 * How long after payment the confirmation strip stays useful.
 *
 * The seen marker is device-local, so without a recency window a phone the
 * exhibitor has never opened My Shows on would greet them with one strip per
 * show they paid for months ago — the opposite of "shows once, then retires".
 */
export const PAID_STRIP_WINDOW_DAYS = 14;

const PAID_STRIP_WINDOW_MS = PAID_STRIP_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export function hasSeenPaidStrip(rowId: string): boolean {
  try {
    return localStorage.getItem(`${PREFIX}${rowId}`) === '1';
  } catch {
    // Storage can be unavailable in private browsing or locked-down contexts.
    return false;
  }
}

export function markPaidStripSeen(rowId: string): void {
  try {
    localStorage.setItem(`${PREFIX}${rowId}`, '1');
  } catch {
    // Same: the strip is dismissed in memory for this page load either way.
  }
}

/**
 * ONE strip per show, folding every recently paid, not-yet-dismissed PAYMENT
 * at that show together. One strip per ORDER was the first cut, and the
 * browser walk on the seeded exhibitor rendered 255 of them: a show entered
 * through many orders must still say "you're paid here" exactly once.
 *
 * Dismissal keys on the ROW that was paid, not the order (Codex review on
 * PR #2548): an order can mix a paid class with a still-pending sibling
 * (MYK9-804), and keying dismissal on the order would hide that sibling's OWN
 * strip forever once it is later paid too — the same order id would already
 * read "seen".
 */
export interface PaidStrip {
  /** Row ids the strip confirms; Dismiss retires exactly these payments. */
  paidRowIds: string[];
  /** Dogs the payments covered, in card order, each once. */
  dogNames: string[];
  /** What was paid across those rows, in cents. */
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

/** This ROW's own resolved payment status, falling back to the order's only
 *  when the row never carried one of its own — the same fallback
 *  `toBalanceSources` (myEntryOrderBalance.ts) uses for the DUE side. */
function resolvedRowPaymentStatus(cls: EntryClass, order: MyEntry): PaymentStatus {
  return cls.paymentStatus ?? order.paymentStatus;
}

/**
 * Every (dogName, feeCents) this order actually settled through the ONLINE
 * cart, read from each ROW'S OWN payment status — never the order's
 * reconciled status. `reconcileOrderPaymentStatus` (myEntryOrderBalance.ts)
 * deliberately returns PENDING the moment any sibling row is still unpaid, so
 * gating on `order.paymentStatus` here silently dropped a dog's already-paid
 * class the moment another dog on the SAME order still owed money — the exact
 * "order can mix paid and pending class rows" case `EntryClass.paymentStatus`
 * exists to cover (MYK9-804).
 *
 * Cash, check, secretary-recorded and waived rows never produce a strip:
 * there was no checkout to confirm, and no receipt email to point at.
 */
interface PaidRow {
  /** The class row's own id, or the order's id for a `dogs`-less fixture. */
  rowId: string;
  dogName: string;
  feeCents: number;
}

function paidOnlineRowsOf(order: MyEntry): PaidRow[] {
  if (order.dogs.length === 0) {
    // Hand-built fixture with no `dogs[]` populated — fall back to the
    // order's own top-level fields, matching the pre-existing behavior.
    return order.paymentStatus === PaymentStatus.PAID_ONLINE
      ? [{ rowId: order.id, dogName: order.dogName, feeCents: Math.round(order.totalFee * 100) }]
      : [];
  }

  const rows: PaidRow[] = [];
  for (const dog of order.dogs) {
    for (const cls of dog.classes) {
      if (resolvedRowPaymentStatus(cls, order) === PaymentStatus.PAID_ONLINE) {
        rows.push({ rowId: cls.id, dogName: dog.dogName, feeCents: Math.round(cls.fee * 100) });
      }
    }
  }
  return rows;
}

/** Was this payment recent enough to still be worth confirming? */
function isWithinWindow(order: MyEntry, now: Date): boolean {
  return now.getTime() - order.submittedAt.getTime() <= PAID_STRIP_WINDOW_MS;
}

/**
 * The paid strip a show group should render right now, or null.
 *
 * @param orders EVERY order for this show, regardless of the page's own When
 *   or Status filters — a dated statement of money received must not change
 *   when the list is filtered (MYK9-804). Callers must pass the show's full,
 *   unfiltered order set, never a filtered view like `MyShowGroup.orders`.
 * @param hasSeen Injected so the pure derivation stays testable and the caller
 *   can keep an in-memory dismissal set alongside the stored one. Called per
 *   PAID ROW id, not per order — see `PaidStrip`'s own doc.
 */
export function derivePaidStrip(
  orders: MyEntry[],
  now: Date,
  hasSeen: (rowId: string) => boolean
): PaidStrip | null {
  const paidRowIds: string[] = [];
  const dogNames: string[] = [];
  let amountCents = 0;
  let date: Date | null = null;

  for (const order of orders) {
    if (!isWithinWindow(order, now) || isPastShowEntry(order, now)) continue;
    const rows = paidOnlineRowsOf(order).filter(row => !hasSeen(row.rowId));
    if (rows.length === 0) continue;

    for (const row of rows) {
      paidRowIds.push(row.rowId);
      if (!dogNames.includes(row.dogName)) dogNames.push(row.dogName);
      amountCents += row.feeCents;
    }
    if (!date || order.submittedAt > date) date = order.submittedAt;
  }

  if (paidRowIds.length === 0 || !date) return null;
  return { paidRowIds, dogNames, amountCents, date };
}
