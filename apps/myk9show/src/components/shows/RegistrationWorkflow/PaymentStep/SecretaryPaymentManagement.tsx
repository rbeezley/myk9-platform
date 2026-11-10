import React from 'react';
import { Check, Gift, Receipt } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import type { SecretaryPaymentManagementProps } from './types';

const TITLE_ID = 'secretary-desk-payment-title';

/**
 * MYK9-1822: the secretary's three desk actions for this entry, on one card in
 * plain words. "Paid by cash or check" and "Make free" are shortcuts to the
 * Payment Method list above: they call the same method handler, so the entry is
 * recorded the one way the list records it (cash or check through "Already
 * received", a free entry through the waived method). Accepting, wait-listing,
 * setting an entry back to unpaid and marking several entries at once live on
 * Entry management.
 */
export const SecretaryPaymentManagement: React.FC<SecretaryPaymentManagementProps> = ({
  paymentMethod,
  feeCalculation,
  feeOverride,
  onFeeOverrideChange,
  onPaymentMethodChange,
}) => {
  const isFree = paymentMethod === 'waived';
  const isPaidAtDesk = paymentMethod === 'secretary_paid';

  return (
    <PermissionGuard permission="registration:override_fees">
      <Card role="region" aria-labelledby={TITLE_ID}>
        <CardHeader>
          <CardTitle id={TITLE_ID} className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4" aria-hidden />
            Payment at the desk
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isFree && (
            <div className="space-y-1">
              <Label htmlFor="fee-override">Change the total</Label>
              <Input
                id="fee-override"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={feeOverride ?? ''}
                onChange={e =>
                  onFeeOverrideChange(e.target.value ? parseFloat(e.target.value) : null)
                }
                placeholder={`$${feeCalculation.total.toFixed(2)}`}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to charge the usual ${feeCalculation.total.toFixed(2)}.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Button
              type="button"
              variant={isPaidAtDesk ? 'default' : 'outline'}
              aria-pressed={isPaidAtDesk}
              onClick={() => onPaymentMethodChange('secretary_paid')}
              className="justify-start"
            >
              <Check className="h-4 w-4 mr-2" aria-hidden />
              Paid by cash or check
            </Button>
            <Button
              type="button"
              variant={isFree ? 'default' : 'outline'}
              aria-pressed={isFree}
              onClick={() => onPaymentMethodChange('waived')}
              className="justify-start"
            >
              <Gift className="h-4 w-4 mr-2" aria-hidden />
              Make free
            </Button>
          </div>

          {isPaidAtDesk && (
            <p className="text-sm text-muted-foreground">
              Now choose cash or check under Payment Method.
            </p>
          )}
          {isFree && <p className="text-sm text-muted-foreground">This is a free entry.</p>}

          <p className="text-xs text-muted-foreground">
            To accept or wait-list an entry, set it back to unpaid, or mark several entries paid at
            once, use Entry management after you save.
          </p>
        </CardContent>
      </Card>
    </PermissionGuard>
  );
};
