import { currentCalendarDate } from '@/features/_shared/isDayOfShowEntry';
import { PaymentStatus } from '@/types/show-registration-types';

/**
 * MYK9-677: what `entries.payment_received_on` becomes when a secretary records
 * an enrollment payment on Entry Management.
 *
 * The column is a Postgres `date`: the day the money reached the desk, on the
 * SHOW's calendar (never the browser's; a secretary checking in from another
 * zone must not move a payment across the show's midnight). The Show Closeout
 * money card keys on it to tell desk cash from a check banked weeks earlier.
 *
 * - Cash or check received (in full, or a partial amount on account): today in
 *   the show's zone.
 * - Reset to "Payment Due" with nothing paid: `null`, since no money is held.
 * - Anything else (online, waived, refunds): `undefined`, leave the column as
 *   it is. None of those is money arriving at the desk.
 */
export function paymentReceivedOnForStatus(
  status: PaymentStatus | string,
  paidAmount: number | null | undefined,
  timeZone: string,
  now: Date = new Date()
): string | null | undefined {
  if (status === PaymentStatus.PAID_BY_CASH || status === PaymentStatus.PAID_BY_CHECK) {
    return currentCalendarDate(now, timeZone);
  }
  if (status === PaymentStatus.PENDING) {
    return paidAmount != null && paidAmount > 0 ? currentCalendarDate(now, timeZone) : null;
  }
  return undefined;
}
