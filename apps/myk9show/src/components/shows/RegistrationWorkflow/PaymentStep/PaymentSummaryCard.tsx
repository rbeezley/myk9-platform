import React from 'react';
import { CreditCard, Calendar, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getPaymentMethodLabel } from './utils';
import { PAYMENT_MESSAGES } from './types';
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
  const amountDueValue = feeOverride ?? feeCalculation.total;
  const requiresPaymentMethod = !isWaived && amountDueValue > 0 && !paymentMethod;
  const amountDue = isWaived ? '$0.00 (Waived)' : `$${amountDueValue.toFixed(2)}`;

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
              {paymentMethod ? getPaymentMethodLabel(paymentMethod) : 'Not selected'}
            </Badge>
          </div>
          <div className="flex justify-between font-semibold text-lg">
            <span>Amount Due:</span>
            <span>{amountDue}</span>
          </div>
          {paymentMethod === 'credit_card' && (
            <Alert>
              <CreditCard className="h-4 w-4" />
              <AlertDescription>{PAYMENT_MESSAGES.CARD_CHECKOUT_REDIRECT}</AlertDescription>
            </Alert>
          )}
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
