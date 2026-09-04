import React from 'react';
import { Calendar, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePlatformFeeRates } from '@/hooks/queries/usePlatformFeeRates';
import { calculatePlatformFeeCents, formatCartCurrency } from '@/store/cartStore.helpers';
import { PlatformFeeSplitLines } from '@/features/payments/PlatformFeeSplitLines';
import { getPaymentMethodLabel } from './utils';
import type { PaymentSummaryCardProps } from './types';
import { availabilityPlaceholder } from './types';

/**
 * Displays the final payment summary: selected method, amount due, and contextual alerts.
 */
export const PaymentSummaryCard: React.FC<PaymentSummaryCardProps> = ({
  paymentMethod,
  feeCalculation,
  capacityReady = true,
  capacityUnavailable = false,
  waiveFees,
  feeOverride,
}) => {
  const feeRates = usePlatformFeeRates();
  const isWaived = paymentMethod === 'waived' || waiveFees;
  const entryFeeCents = Math.round((feeOverride ?? feeCalculation.total) * 100);
  const isPayableCard =
    capacityReady && !isWaived && paymentMethod === 'credit_card' && entryFeeCents > 0;
  // Use the cart preview's configured rates and cent rounding. Offline methods
  // and wait-list-only entries do not go through card checkout.
  const serviceFeeCents = isPayableCard ? calculatePlatformFeeCents(entryFeeCents, feeRates) : 0;
  const amountDueValue = entryFeeCents + serviceFeeCents;
  const requiresPaymentMethod = capacityReady && !isWaived && amountDueValue > 0 && !paymentMethod;
  const amountDue = !capacityReady
    ? availabilityPlaceholder(capacityUnavailable)
    : isWaived
      ? '$0.00 (Waived)'
      : formatCartCurrency(amountDueValue);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payment Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Selected Payment Method:</span>
            <Badge variant="outline">
              {paymentMethod ? getPaymentMethodLabel(paymentMethod) : 'Not selected'}
            </Badge>
          </div>
          {isPayableCard && (
            <PlatformFeeSplitLines subtotalCents={entryFeeCents} rates={feeRates} />
          )}
          <div className="flex flex-wrap justify-between gap-2 font-semibold text-lg">
            <span>Amount Due:</span>
            <span>{amountDue}</span>
          </div>
          {requiresPaymentMethod && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Choose a payment method to continue to the final review.
              </AlertDescription>
            </Alert>
          )}
          {['check', 'cash'].includes(paymentMethod) && (
            <Alert>
              <Calendar className="h-4 w-4" />
              <AlertDescription>
                Payment must be completed at the show before check-in.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
