import type { PaymentDetails, PaymentMethod } from '@/types/show-registration-types';

/**
 * MYK9-2149 (Codex P2): the payment details saved onto the entry form are the ones the FINAL
 * payment choice uses. The payment step keeps every field in state as the secretary switches
 * choices, so a check number typed under "Check received" and then left behind by a switch to
 * "pay at show" or "Paid by a club or group" must not be written.
 *
 * - Cash or check received: the reference (check or receipt number), date and notes.
 * - Check at the show: its check number (the exhibitor list's "Check" panel asks for it).
 * - Paid by a club or group: its reference.
 * - Free entry: the notes, which hold the reason the entry is free.
 * - Cash at the show, or the money already on the form: nothing (no money changed hands).
 *
 * Blank fields are dropped later by `buildEnrollmentPaymentDetailFields`.
 */
export function paymentDetailsForMethod(
  paymentMethod: PaymentMethod | undefined,
  details: PaymentDetails | undefined
): PaymentDetails {
  if (!details) return {};
  switch (paymentMethod) {
    case 'secretary_paid': {
      if (!details.receivedMethod) return {};
      const picked: PaymentDetails = {};
      if (details.paymentReference !== undefined)
        picked.paymentReference = details.paymentReference;
      if (details.receivedMethod === 'check' && details.checkNumber !== undefined) {
        picked.checkNumber = details.checkNumber;
      }
      if (details.paymentDate !== undefined) picked.paymentDate = details.paymentDate;
      if (details.paymentNotes !== undefined) picked.paymentNotes = details.paymentNotes;
      return picked;
    }
    case 'check':
      return details.checkNumber !== undefined ? { checkNumber: details.checkNumber } : {};
    case 'group_payment':
      return details.groupReference !== undefined ? { groupReference: details.groupReference } : {};
    case 'waived':
      return details.paymentNotes !== undefined ? { paymentNotes: details.paymentNotes } : {};
    default:
      return {};
  }
}
