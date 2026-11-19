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
import { PaymentStatus } from '@/types/show-registration-types';

export type PaidAs = 'online' | 'check' | 'cash';

/** How this entry's own money arrived, or null while nothing has been paid. */
export function paidAsFromStatus(status: PaymentStatus | undefined): PaidAs | null {
  switch (status) {
    case PaymentStatus.PAID_ONLINE:
      return 'online';
    case PaymentStatus.PAID_BY_CHECK:
      return 'check';
    case PaymentStatus.PAID_BY_CASH:
      return 'cash';
    default:
      return null;
  }
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
