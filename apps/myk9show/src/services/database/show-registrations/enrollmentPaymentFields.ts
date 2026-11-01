/**
 * The enrollment columns the client writes when entries are submitted: the
 * payment DETAILS a secretary typed (reference, check number, date, group
 * reference, notes), and only the ones given, so a secretary's earlier details
 * are never blanked by an add-on.
 *
 * MYK9-1634: what a form owes and how it stands are the database's. Triggers
 * keep `total_amount` equal to the live, non-waived entries' fees, and
 * `submit_show_entries` records the submission's status in the same
 * transaction as the entries. So the client never writes `total_amount`,
 * `payment_status`, `paid_amount` or `payment_method`.
 */

import type { PaymentDetails } from '@/types/show-registration-types';
import type { TablesUpdate } from '@/types/supabase';

export function buildEnrollmentPaymentDetailFields(
  paymentDetails: PaymentDetails | undefined
): TablesUpdate<'enrollments'> {
  const fields: TablesUpdate<'enrollments'> = {};
  if (paymentDetails?.paymentReference !== undefined) {
    fields.payment_reference = paymentDetails.paymentReference;
  }
  if (paymentDetails?.checkNumber !== undefined) {
    fields.check_number = paymentDetails.checkNumber;
  }
  if (paymentDetails?.paymentDate !== undefined) {
    fields.payment_date = paymentDetails.paymentDate;
  }
  if (paymentDetails?.groupReference !== undefined) {
    fields.group_reference = paymentDetails.groupReference;
  }
  if (paymentDetails?.paymentNotes !== undefined) {
    fields.payment_notes = paymentDetails.paymentNotes;
  }
  return fields;
}
