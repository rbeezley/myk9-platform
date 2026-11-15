/**
 * MYK9-1964: the card Pay button's amount, from the SAME derivation the
 * entries panel's "Total due" uses (`computePaymentTotals` over the wizard's
 * one fee calculation and the live fee rates), so the button and the total on
 * screen cannot disagree. Null whenever the panel would not show a payable card
 * figure: availability or the fee tier unresolved, nothing to pay, or a method
 * other than card.
 *
 * Display only. Stripe is charged what `stripe-checkout` prices from the cart
 * row; this number is never sent anywhere.
 */
import { useMemo } from 'react';
import { usePlatformFeeRates } from '@/hooks/queries/usePlatformFeeRates';
import { computePaymentTotals } from '@/components/shows/RegistrationWorkflow/EntriesPanel/EntriesPanel.helpers';
import type { FeeCalculationResult } from '@/components/shows/RegistrationWorkflow/PaymentStep/types';
import type { PaymentMethod } from '@/types/show-registration-types';

export interface PaymentAmountDueInput {
  paymentMethod: PaymentMethod | '' | undefined;
  feeCalculation: FeeCalculationResult;
  capacityReady: boolean;
  /** The show's entry-window timezone, which decides the fee tier. */
  feeTier: { isReady: boolean };
}

export function usePaymentAmountDueCents({
  paymentMethod,
  feeCalculation,
  capacityReady,
  feeTier,
}: PaymentAmountDueInput): number | null {
  const rates = usePlatformFeeRates();
  const feeTierReady = feeTier.isReady;
  return useMemo(() => {
    const totals = computePaymentTotals({
      paymentMethod: paymentMethod ?? '',
      feeCalculation,
      // As the panel combines them: either read unresolved withholds the figure.
      capacityReady: capacityReady && feeTierReady,
      rates,
    });
    return totals.isPayableCard ? totals.amountDueCents : null;
  }, [paymentMethod, feeCalculation, capacityReady, feeTierReady, rates]);
}
