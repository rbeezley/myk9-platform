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

/** A detail the secretary actually typed: set and not blank. */
const typed = (value: string | undefined): value is string =>
  value !== undefined && value.trim() !== '';

/**
 * MYK9-2149 (Codex P2): the payment step sends every detail field, blank ones included,
 * whichever choice the secretary switched to, so a blank field is "not typed", never "clear
 * it": blank never overwrites a check number, date, reference or notes the form already has.
 */
export function buildEnrollmentPaymentDetailFields(
  paymentDetails: PaymentDetails | undefined
): TablesUpdate<'enrollments'> {
  const fields: TablesUpdate<'enrollments'> = {};
  if (typed(paymentDetails?.paymentReference)) {
    fields.payment_reference = paymentDetails.paymentReference;
  }
  if (typed(paymentDetails?.checkNumber)) {
    fields.check_number = paymentDetails.checkNumber;
  }
  if (typed(paymentDetails?.paymentDate)) {
    fields.payment_date = paymentDetails.paymentDate;
  }
  if (typed(paymentDetails?.groupReference)) {
    fields.group_reference = paymentDetails.groupReference;
  }
  if (typed(paymentDetails?.paymentNotes)) {
    fields.payment_notes = paymentDetails.paymentNotes;
  }
  return fields;
}
