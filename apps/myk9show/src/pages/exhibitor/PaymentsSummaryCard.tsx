import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  formatPaymentCents,
  type PaymentDisplayRow,
} from '@/features/payments/moneyPresentation';
import { summarizePaymentLedgerTotals } from '@/features/payments/paymentsSummary';

/**
 * At-a-glance net total from the same visible rows in the table, so refunds
 * cannot disappear from the header math.
 */
export function PaymentsSummary({
  rows,
  yearLabel,
}: {
  rows: PaymentDisplayRow[];
  /** Selected calendar year, or null for all time. Scopes the count sentence. */
  yearLabel: string | null;
}) {
  const totals = useMemo(() => summarizePaymentLedgerTotals(rows), [rows]);
  if (totals.length === 0) return null;

  // Only pair the cards up when there is genuinely more than one currency.
  // An unconditional two-column grid left the single-currency case (the normal
  // case) occupying half the container with an empty half beside it, which
  // reads as a broken layout rather than deliberate whitespace.
  return (
    <div className={totals.length > 1 ? 'grid grid-cols-1 gap-4 sm:grid-cols-2' : 'grid gap-4'}>
      {totals.map(t => (
        <Card key={t.currency} className="border-primary/40">
          <CardContent className="py-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Gross paid</p>
                <p className="text-xl font-semibold tabular-nums">
                  {formatPaymentCents(t.grossPaidCents, t.currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Refunds</p>
                <p className="text-xl font-semibold tabular-nums text-muted-foreground">
                  {/* Only negate an actual refund: Intl formats -0 as "-$0.00",
                      so every exhibitor with no refunds was shown a negative
                      zero on a money surface. */}
                  {formatPaymentCents(t.refundCents > 0 ? -t.refundCents : 0, t.currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Net paid</p>
                <p className="text-xl font-semibold tabular-nums text-primary">
                  {formatPaymentCents(t.netPaidCents, t.currency)}
                </p>
              </div>
            </div>
            {/* The scope rides on the count sentence rather than a separate
                caption because the card is one unit: "Gross paid $500" above
                "12 payments in 2025" is scoped, whereas an unlabelled total
                under a year filter is a money claim about a period the
                exhibitor never named. */}
            <p className="mt-3 text-sm text-muted-foreground">
              {t.paymentCount} {t.paymentCount === 1 ? 'payment' : 'payments'}
              {t.refundCount > 0
                ? `, ${t.refundCount} ${t.refundCount === 1 ? 'refund' : 'refunds'}`
                : ''}
              {yearLabel ? ` in ${yearLabel}` : ''}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
