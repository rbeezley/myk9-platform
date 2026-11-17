import { useState } from 'react';
import type { PaymentDetails } from '@/types/show-registration-types';

/** The payment-detail fields the payment choices edit, as the form holds them. */
export interface PaymentDetailsFields {
  checkNumber: string;
  paymentDate: string;
  paymentReference: string;
  groupReference: string;
  paymentNotes: string;
  receivedMethod: PaymentDetails['receivedMethod'];
  chargeJuniorFee: boolean;
}

/**
 * The payment-detail fields shared by the exhibitor's Payment Method list and
 * the secretary's payment choices (MYK9-2020), so both send the wizard the same
 * snapshot shape. Seeded once from the details the wizard already holds
 * (MYK9-878: going back and returning shows what submit will send).
 *
 * `update` fires `onPaymentDetailsChange` with the current fields plus the
 * patch, exactly as the list's per-field handlers did before they moved here:
 * `receivedMethod` and `chargeJuniorFee` are sent only once set, unless the
 * patch itself carries them.
 */
export function usePaymentDetailsFields(
  getInitialDetails: (() => PaymentDetails | undefined) | undefined,
  onPaymentDetailsChange: ((details: PaymentDetails) => void) | undefined
) {
  const [fields, setFields] = useState<PaymentDetailsFields>(() => {
    const initial = getInitialDetails?.();
    return {
      checkNumber: initial?.checkNumber ?? '',
      paymentDate: initial?.paymentDate ?? '',
      paymentReference: initial?.paymentReference ?? '',
      groupReference: initial?.groupReference ?? '',
      paymentNotes: initial?.paymentNotes ?? '',
      receivedMethod: initial?.receivedMethod,
      chargeJuniorFee: initial?.chargeJuniorFee === true,
    };
  });

  const update = (patch: Partial<PaymentDetailsFields>) => {
    setFields(previous => ({ ...previous, ...patch }));
    if (!onPaymentDetailsChange) return;
    const { receivedMethod, chargeJuniorFee } = fields;
    onPaymentDetailsChange({
      checkNumber: fields.checkNumber,
      paymentDate: fields.paymentDate,
      paymentReference: fields.paymentReference,
      groupReference: fields.groupReference,
      paymentNotes: fields.paymentNotes,
      ...(receivedMethod ? { receivedMethod } : {}),
      ...(chargeJuniorFee ? { chargeJuniorFee } : {}),
      ...(patch as Partial<PaymentDetails>),
    });
  };

  return { fields, update };
}
