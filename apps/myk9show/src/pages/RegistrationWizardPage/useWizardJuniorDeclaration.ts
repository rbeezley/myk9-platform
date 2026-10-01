import type { PaymentMethod } from '@/types/show-registration-types';
import { usePaymentMethodResolution } from '@/components/shows/RegistrationWorkflow/PaymentStep/usePaymentMethodResolution';
import { useJuniorHandlerDeclaration } from './useJuniorHandlerDeclaration';

interface Params {
  showId: string;
  selectedDogs: readonly string[];
  /** The RAW selection in wizard state; the effective method is derived here. */
  selectedPaymentMethod: PaymentMethod | undefined;
  show: { juniorHandlerFee?: string | undefined; organization?: string | undefined } | undefined;
}

/**
 * The wizard's single payment-method derivation plus the junior declarations that
 * depend on it (MYK9-879).
 *
 * Declarations are offered and priced from the EFFECTIVE method
 * (`paymentResolution.effectivePaymentMethod`, the card fallback applied), the same
 * value PaymentStep and the entries panel use, never the raw selection. A restored
 * draft that picked card while the club's Stripe readiness is still pending is
 * paying by check or cash for the moment: nothing is offered or discounted, and the
 * ticks are kept so they apply again, unchanged, when card checkout becomes ready.
 */
export function useWizardJuniorDeclaration({
  showId,
  selectedDogs,
  selectedPaymentMethod,
  show,
}: Params) {
  const paymentResolution = usePaymentMethodResolution(showId, selectedPaymentMethod ?? '');
  const declaration = useJuniorHandlerDeclaration({
    selectedDogs,
    paymentMethod: paymentResolution.effectivePaymentMethod,
    show,
  });
  return { paymentResolution, ...declaration };
}
