import type { EntryManagementEntry } from '@/types/entry-management-types';
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

/** MYK9-2303: whether the entry menu offers the refund dialog. A card-paid entry the club
 * already paid back stays reachable after a card refund stamped it, so its club record can
 * be reversed or added to. Deliberately NOT folded into `isStripeRefundable`, which the
 * withdraw outcome, bulk menu and pull reconciliation read as "a card refund is owed". */
export function offersRefundDialog(
  entry: Pick<EntryManagementEntry, 'paymentMethod' | 'refundedAt' | 'paymentStatus'> &
    Partial<Pick<EntryManagementEntry, 'clubRefundedAmount'>>
): boolean {
  if (isStripeRefundable(entry)) return true;
  return entry.paymentMethod === 'online' && (entry.clubRefundedAmount ?? 0) > 0;
}
