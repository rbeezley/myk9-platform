import React from 'react';
import { CreditCard, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getPaymentMethodLabel } from './utils';
import type { PaymentSummaryCardProps } from './types';

/**
 * Displays the final payment summary: selected method, amount due, and contextual alerts.
 */
export const PaymentSummaryCard: React.FC<PaymentSummaryCardProps> = ({
  paymentMethod,
  feeCalculation,
  waiveFees,
  feeOverride,
}) => {
  const isWaived = paymentMethod === 'waived' || waiveFees;
  const amountDue = isWaived
    ? '$0.00 (Waived)'
    : `$${(feeOverride || feeCalculation.total).toFixed(2)}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payment Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span>Selected Payment Method:</span>
            <Badge variant="outline">
              {getPaymentMethodLabel(paymentMethod)}
            </Badge>
          </div>
          <div className="flex justify-between font-semibold text-lg">
            <span>Amount Due:</span>
            <span>{amountDue}</span>
          </div>
          {paymentMethod === 'credit_card' && (
            <Alert>
              <CreditCard className="h-4 w-4" />
              <AlertDescription>
                Payment will be processed securely via Stripe when you complete registration.
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
