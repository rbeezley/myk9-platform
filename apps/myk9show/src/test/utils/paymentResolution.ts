/**
 * A `PaymentMethodResolution` for tests that render `PaymentStep` or
 * `WorkflowStepContent` directly.
 *
 * The real value is produced by `usePaymentMethodResolution`, which the PAGE
 * owns so the entries panel and the payment controls read one derivation. Tests
 * that mount those components outside the page still have to supply it; this is
 * the neutral default (card available, show takes check and cash), overridable
 * per test; pass `paymentMethod` and the effective method is derived by the real
 * `getEffectivePaymentMethod` rather than stated independently. A test that cares how the fallback is DERIVED should call the hook
 * or `getEffectivePaymentMethod` rather than hand-building a value here.
 */

import type { PaymentMethodResolution } from '@/components/shows/RegistrationWorkflow/PaymentStep/usePaymentMethodResolution';
import { getEffectivePaymentMethod } from '@/components/shows/RegistrationWorkflow/PaymentStep/utils';
import type { PaymentMethod } from '@/types/show-registration-types';

export function makePaymentResolution(
  overrides: Partial<PaymentMethodResolution> & { paymentMethod?: PaymentMethod | '' } = {}
): PaymentMethodResolution {
  const { paymentMethod = '', ...rest } = overrides;
  const acceptedMethods = rest.acceptedMethods ?? { check: true, cash: true };
  const cardCheckoutAvailable = rest.cardCheckoutAvailable ?? true;
  return {
    // Derived by the REAL rule, so a fixture can never assert a pairing the
    // production derivation would not produce.
    effectivePaymentMethod: getEffectivePaymentMethod({
      paymentMethod,
      acceptedMethods,
      cardCheckoutAvailable,
    }),
    acceptedMethods,
    cardCheckoutAvailable,
    accountCheckPending: false,
    cardCheckoutUnavailableReason: undefined,
    isOnBehalf: false,
    show: undefined,
    ...rest,
  };
}
