import type { EntryManagementEntry } from '@/types/entry-management-types';
import { dollarsToCents } from '@/features/financial/entryAccounting';
import { remainingBalanceCents } from './clubSettledRefundMoney';
import { PaymentStatus } from '@/types/show-registration-types';

/** An entry qualifies for the Stripe refund flow exactly when it was paid
 * online and hasn't been refunded yet. Server-side validation remains
 * authoritative; this only decides whether to offer the dialog.
 *
 * Lives in its own module (not RefundEntryDialog.tsx) so the component file
 * exports only components — satisfies react-refresh/only-export-components. */
export function isStripeRefundable(
  entry: Pick<EntryManagementEntry, 'paymentMethod' | 'refundedAt' | 'paymentStatus'>
): boolean {
  return (
    entry.paymentMethod === 'online' &&
    entry.paymentStatus === PaymentStatus.PAID_ONLINE &&
    !entry.refundedAt
  );
}

/** MYK9-2303: whether the entry menu offers the refund dialog. A card-paid entry stays
 * reachable after a card refund stamped it while the club still owes a balance (so its first
 * club payment can be recorded) or has a record to reverse. A fully refunded entry with no
 * club record is not offered. Deliberately NOT folded into `isStripeRefundable`, which the
 * withdraw outcome, bulk menu and pull reconciliation read as "a card refund is owed". */
export function offersRefundDialog(
  entry: Pick<EntryManagementEntry, 'paymentMethod' | 'refundedAt' | 'paymentStatus' | 'totalFee'> &
    Partial<Pick<EntryManagementEntry, 'clubRefundedAmount' | 'refundAmount' | 'discountAmount'>>
): boolean {
  if (isStripeRefundable(entry)) return true;
  if (entry.paymentMethod !== 'online') return false;
  if ((entry.clubRefundedAmount ?? 0) > 0) return true;
  return (
    entry.paymentStatus === PaymentStatus.PAID_ONLINE &&
    remainingBalanceCents(
      entry.totalFee,
      entry.discountAmount,
      entry.refundAmount,
      dollarsToCents(entry.clubRefundedAmount ?? 0)
    ) > 0
  );
}
