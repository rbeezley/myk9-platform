/**
 * What the exhibitor paid for the class she is removing, said before she confirms (MYK9-2001).
 *
 * Amounts are what she PAID, from the entry's own recorded fee and the order's recorded service
 * fee, never the show's current fees (which may have changed since). The sentence about the refund
 * says who decides and promises no amount: the app holds neither the premium nor the club's
 * processing fee (docs/INTENT.md, Withdraw vs Pull). Nothing here issues or schedules a refund.
 *
 * The service fee is charged once on the whole order, not per entry, so its amount is named only
 * when the order paid for this one entry; on a larger order the line says it is not refunded and
 * names no figure rather than inventing a share. A check or cash entry has no service fee line.
 */
import { dispositionOf } from '@/utils/effectivePaymentStatus';
import type { PaymentStatus } from '@/types/show-registration-types';

export type PaidAs = 'online' | 'check' | 'cash';

/**
 * How this class row's own money arrived, or null while nothing is paid (or the method is not
 * recorded). `paymentStatus` is the row's RECONCILED status (a reopened desk payment reads as
 * unpaid), never the raw column. The database's generic `paid` maps to PAID_ONLINE even for a
 * check, so the recorded `payment_method` decides how it was paid, and only the method the row
 * itself records is believed.
 */
export function paidAsFromRow(row: {
  paymentStatus: PaymentStatus | undefined;
  paymentMethod: string | null | undefined;
}): PaidAs | null {
  if (!row.paymentStatus || dispositionOf(row.paymentStatus) !== 'paid') return null;
  const method = (row.paymentMethod ?? '').trim().toLowerCase();
  return method === 'online' || method === 'check' || method === 'cash' ? method : null;
}

/**
 * The one settled charge that paid for this entry, or null when none or more than one did. The
 * receipt read returns every overlapping order, oldest first, failed or pending attempts included
 * (a checkout retry, a waitlist promotion); a service fee is quoted only from a charge that
 * settled, and only when it is the only one, so an earlier attempt's fee is never quoted.
 */
export function orderThatPaidFor<T extends { entryIds: readonly string[]; status: string }>(
  entryId: string,
  orders: readonly T[] | undefined
): T | null {
  const settled = (orders ?? []).filter(
    order => order.status === 'succeeded' && order.entryIds.includes(entryId)
  );
  return settled.length === 1 ? (settled[0] ?? null) : null;
}

export interface PullOutMoneyInput {
  paidAs: PaidAs | null;
  /** The entry's own recorded fee, in dollars. */
  entryFee: number;
  /** The order that paid for it; null for a check or cash entry or while it loads. */
  order: { entryIds: readonly string[]; platformFeeCents: number | null } | null;
}

const dollars = (value: number) => `$${value.toFixed(2)}`;

/** The lines to show, or an empty list when nothing was paid (nothing to say about money). */
export function pullOutMoneyLines({ paidAs, entryFee, order }: PullOutMoneyInput): string[] {
  if (!paidAs || !(entryFee > 0)) return [];
  const lines = [`Entry fee ${dollars(entryFee)}: the secretary decides on a refund.`];
  if (paidAs === 'online' && order && (order.platformFeeCents ?? 0) > 0) {
    lines.push(
      order.entryIds.length === 1
        ? `Service fee ${dollars((order.platformFeeCents ?? 0) / 100)}: not refunded.`
        : 'Service fee: not refunded.'
    );
  }
  return lines;
}
