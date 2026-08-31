import React from 'react';
import { Tag, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { RegistrationSummaryProps } from './types';

/**
 * Displays the fee breakdown for each dog and class, discounts, and total due.
 */
export const RegistrationSummary: React.FC<RegistrationSummaryProps> = ({
  feeCalculation,
  capacityReady = true,
  capacityUnavailable = false,
  onRemoveLine,
  removingLineKey,
}) => {
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
                {item.classes.map(cls => (
                  <div
                    key={cls.classId}
                    className="flex items-center justify-between gap-2 text-sm text-muted-foreground"
                  >
                    <span className="min-w-0 break-words">
                      {cls.className}
                      {capacityReady && cls.isWaitlist && (
                        <span className="ml-2 font-medium text-warning">
                          (Wait list request)
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span>
                        {capacityReady
                          ? cls.isWaitlist
                            ? 'No payment due'
                            : `$${cls.fee.toFixed(2)}`
                          : capacityUnavailable
                            ? 'Not confirmed'
                            : 'Checking availability'}
                      </span>
                      {onRemoveLine && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="min-h-11 min-w-11"
                          title={`Remove ${cls.className}`}
                          aria-label={`Remove ${cls.className}`}
                          disabled={removingLineKey === `${item.dogId}:${cls.classId}`}
                          onClick={() => void onRemoveLine(item.dogId, cls.classId)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <Separator />

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span>{capacityReady ? `$${feeCalculation.subtotal.toFixed(2)}` : '—'}</span>
            </div>

            {feeCalculation.discounts.map((discount, index) => (
              <div key={index} className="flex justify-between gap-2 text-sm text-success ">
                <span className="flex min-w-0 items-center gap-1">
                  <Tag className="h-3 w-3 shrink-0" />
                  <span className="break-words">{discount.description}</span>
                </span>
                <span className="shrink-0">
                  {capacityReady ? `-$${discount.amount.toFixed(2)}` : '—'}
                </span>
              </div>
            ))}

            <Separator />

            <div className="flex justify-between font-semibold">
              <span>Total Due</span>
              <span className="text-lg">
                {capacityReady
                  ? `$${feeCalculation.total.toFixed(2)}`
                  : capacityUnavailable
                    ? 'Not confirmed'
                    : 'Checking availability'}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
