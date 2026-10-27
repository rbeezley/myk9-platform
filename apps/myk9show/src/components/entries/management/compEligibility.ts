import type { EntryManagementEntry } from '@/types/entry-management-types';
import { PaymentStatus } from '@/types/show-registration-types';
import { getEffectivePaymentStatus } from '@/utils/entryManagementUtils';

/**
 * Whether to offer Comp on an entry (MYK9-1407). A comp forgives a fee that is
 * still OWED, so it is offered only while the effective payment status is
 * pending. A paid or refunded entry is never relabelled as forgiven: giving
 * money back is a refund, a separate action.
 *
 * A row that is already waived but not comped is not offered Comp either:
 * there is nothing left to forgive, even though the server would accept it.
 *
 * The entry's own status must be pending too: an entry row that says paid
 * under an unsettled order reads effective pending, but the server refuses a
 * comp on it (trg_entries_comp_payment_status, SQLSTATE MKCMP), so offering
 * the button would only lead to an error. The server stays authoritative.
 */
export function isCompable(
  entry: Pick<EntryManagementEntry, 'comped' | 'paymentStatus' | 'enrollmentPaymentStatus'>
): boolean {
  return (
    !entry.comped &&
    entry.paymentStatus === PaymentStatus.PENDING &&
    getEffectivePaymentStatus(entry) === PaymentStatus.PENDING
  );
}
