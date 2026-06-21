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
