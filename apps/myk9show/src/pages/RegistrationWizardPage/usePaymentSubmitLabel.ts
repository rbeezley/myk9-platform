import { useMemo } from 'react';
import { usePlatformFeeRates } from '@/hooks/queries/usePlatformFeeRates';
import { resolveEntriesPanelMoney } from '@/components/shows/RegistrationWorkflow/EntriesPanel/EntriesPanel.money';
import type { PanelDogGroup } from '@/components/shows/RegistrationWorkflow/EntriesPanel/EntriesPanel.helpers';
import type { FeeCalculationResult } from '@/components/shows/RegistrationWorkflow/PaymentStep/types';
import type { PaymentMethod } from '@/types/show-registration-types';
import { getPaymentSubmitLabel } from './commitLabels';

interface PaymentSubmitLabelInput {
  /** The method the submit acts on. */
  selectedPaymentMethod: PaymentMethod | undefined;
  /** The method the entries panel totals with (the card fallback applied). */
  effectivePaymentMethod: PaymentMethod | '';
  groups: PanelDogGroup[];
  feeCalculation: FeeCalculationResult;
  capacityReady: boolean;
  capacityUnavailable: boolean;
  feeTier: { isReady: boolean; isUnavailable: boolean };
}

/**
 * The Payment step's commit label. For card it reads "Pay $32.10" from the
 * SAME money resolution the entries panel draws "Total due" from (MYK9-1964),
 * with the same inputs the page passes the panel.
 */
export function usePaymentSubmitLabel({
  selectedPaymentMethod,
  effectivePaymentMethod,
  groups,
  feeCalculation,
  capacityReady,
  capacityUnavailable,
  feeTier,
}: PaymentSubmitLabelInput): string {
  const rates = usePlatformFeeRates();
  return useMemo(
    () =>
      getPaymentSubmitLabel(
        selectedPaymentMethod,
        resolveEntriesPanelMoney({
          groups,
          variant: 'payment',
          paymentMethod: effectivePaymentMethod,
          feeCalculation,
          capacityReady,
          capacityUnavailable,
          feeTier,
          rates,
        })
      ),
    [
      selectedPaymentMethod,
      effectivePaymentMethod,
      groups,
      feeCalculation,
      capacityReady,
      capacityUnavailable,
      feeTier,
      rates,
    ]
  );
}
