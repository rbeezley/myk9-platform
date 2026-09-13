import React from 'react';
import { Calendar, Info, Tag } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatCartCurrency, type PlatformFeeRates } from '@/store/cartStore.helpers';
import { PlatformFeeSplitLines } from '@/features/payments/PlatformFeeSplitLines';
import { getPaymentMethodLabel } from '../PaymentStep/utils';
import { availabilityPlaceholder } from '../PaymentStep/types';
import type { PaymentMethod } from '@/types/show-registration-types';
import { formatAmountDue, type PaymentTotals } from './EntriesPanel.helpers';

export interface EntriesPanelTotalsProps {
  classCount: number;
  /** Entry fees only, in integer cents. */
  entryFeeCents: number;
  capacityReady: boolean;
  capacityUnavailable?: boolean | undefined;
  /** Discounts applied to the entry. Always empty today; see MEMORY. */
  discounts?: readonly { amount: number; description: string }[] | undefined;
  /** Payment step only — when present the money block is the payable one. */
  payment?:
    | {
        totals: PaymentTotals;
        paymentMethod: PaymentMethod | '';
        rates: PlatformFeeRates;
      }
    | undefined;
}

function moneyOrPlaceholder(
  capacityReady: boolean,
  capacityUnavailable: boolean | undefined,
  cents: number
): string {
  return capacityReady ? formatCartCurrency(cents) : availabilityPlaceholder(capacityUnavailable);
}

/**
 * The panel's money footer.
 *
 * Before payment it shows entry fees only and says where the service fee
 * appears. On the payment step it adds subtotal / service fee / total due,
 * computed by `computePaymentTotals` — the predicate and rounding lifted out of
 * the retired `PaymentSummaryCard`, so the two cannot disagree (MYK9-367).
 */
export const EntriesPanelTotals: React.FC<EntriesPanelTotalsProps> = ({
  classCount,
  entryFeeCents,
  capacityReady,
  capacityUnavailable,
  discounts,
  payment,
}) => {
  const totals = payment?.totals;
  // Shared with the phone bar's headline so the two can never disagree.
  const amountDue = formatAmountDue({
    capacityReady,
    capacityUnavailable,
    totals,
    entryFeeCents: totals?.amountDueCents ?? 0,
    classCount,
  });

  return (
    <div className="space-y-2">
      <Separator />
      <p className="text-sm text-muted-foreground">
        {classCount} class{classCount === 1 ? '' : 'es'}
      </p>
      <div className="flex items-baseline justify-between gap-2 text-base font-semibold">
        <span>Entry fees</span>
        <span className="tabular-nums">
          {moneyOrPlaceholder(capacityReady, capacityUnavailable, entryFeeCents)}
        </span>
      </div>

      {!payment ? (
        <p className="text-xs text-muted-foreground">
          Service fee shown at payment, only when paying by card.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Payment method</span>
            <Badge variant="outline">
              {payment.paymentMethod
                ? getPaymentMethodLabel(payment.paymentMethod)
                : 'Not selected'}
            </Badge>
          </div>
          {(discounts ?? []).map((discount, index) => (
            <div key={index} className="flex justify-between gap-2 text-sm text-success">
              <span className="flex min-w-0 items-center gap-1">
                <Tag className="h-3 w-3 shrink-0" />
                <span className="break-words">{discount.description}</span>
              </span>
              <span className="shrink-0">
                {capacityReady ? `-$${discount.amount.toFixed(2)}` : '—'}
              </span>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">
              {moneyOrPlaceholder(capacityReady, capacityUnavailable, totals?.entryFeeCents ?? 0)}
            </span>
          </div>
          {totals?.isPayableCard && (
            <PlatformFeeSplitLines subtotalCents={totals.entryFeeCents} rates={payment.rates} />
          )}
          <Separator />
          <div className="flex items-baseline justify-between gap-2 text-lg font-semibold">
            <span>Total due</span>
            <span className="tabular-nums">{amountDue}</span>
          </div>
          {totals?.requiresPaymentMethod && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Choose a payment method to continue to the final review.
              </AlertDescription>
            </Alert>
          )}
          {['check', 'cash'].includes(payment.paymentMethod) && (
            <Alert>
              <Calendar className="h-4 w-4" />
              <AlertDescription>
                Payment must be completed at the show before check-in.
              </AlertDescription>
            </Alert>
          )}
        </>
      )}
    </div>
  );
};
