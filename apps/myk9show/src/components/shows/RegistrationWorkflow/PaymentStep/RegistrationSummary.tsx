import React from 'react';
import { Tag } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { RegistrationSummaryProps } from './types';

/**
 * Displays the fee breakdown for each dog and class, discounts, and total due.
 */
export const RegistrationSummary: React.FC<RegistrationSummaryProps> = ({ feeCalculation }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Registration Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {feeCalculation.breakdown.map((item, index) => (
            <div key={item.dogId || index}>
              <div className="font-medium text-sm">{item.dogName}</div>
              <div className="ml-4 space-y-1">
                {item.classes.map((cls, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between gap-2 text-sm text-muted-foreground"
                  >
                    <span className="min-w-0 break-words">{cls.className}</span>
                    <span className="shrink-0">${cls.fee.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <Separator />

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span>${feeCalculation.subtotal.toFixed(2)}</span>
            </div>

            {feeCalculation.discounts.map((discount, index) => (
              <div key={index} className="flex justify-between gap-2 text-sm text-success ">
                <span className="flex min-w-0 items-center gap-1">
                  <Tag className="h-3 w-3 shrink-0" />
                  <span className="break-words">{discount.description}</span>
                </span>
                <span className="shrink-0">-${discount.amount.toFixed(2)}</span>
              </div>
            ))}

            <Separator />

            <div className="flex justify-between font-semibold">
              <span>Total Due</span>
              <span className="text-lg">${feeCalculation.total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
