/**
 * ExhibitorPaymentsPage — the logged-in exhibitor's own online payment history.
 *
 * Mostly read-only list of stripe_orders (RLS-scoped to the caller): date, show,
 * amount, status, Stripe reference, and a per-row action. For settled orders the
 * action links to the entries the payment covers (where the printable per-entry
 * receipt lives — receipts are entry-scoped, not stored on the order). For
 * failed/cancelled orders it instead deep-links to the cart-recovery / "Finish
 * Payment" flow (`/cart`, scoped by the order's show + entry ids) so the
 * exhibitor can retry without hunting through My Shows. Complements MyEntriesPage's
 * per-entry Receipt / Finish Payment actions with a single chronological money view.
 */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Receipt as ReceiptIcon, CreditCard } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useMyPayments } from '@/features/payments/useMyPayments';
import { buildFinishPaymentHref } from '@/features/payments/finishPaymentHref';
import {
  buildPaymentDisplayRows,
  formatPaymentCents,
  formatPaymentDate,
  isRefundedPaymentStatus,
  isRetryablePaymentStatus,
  paymentStatusLabel,
  type PaymentDisplayRow,
} from '@/features/payments/moneyPresentation';
import { summarizePaymentDisplayRows } from '@/features/payments/paymentsSummary';

/** Placeholder for a missing cell value. Hyphen-minus, never an em dash (UI-copy rule). */
const EMPTY = '-';

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === 'succeeded' || s === 'paid')
    return <Badge variant="default">{paymentStatusLabel(status)}</Badge>;
  if (s === 'refunded') return <Badge variant="secondary">{paymentStatusLabel(status)}</Badge>;
  if (s === 'failed' || s === 'cancelled' || s === 'canceled')
    return <Badge variant="destructive">{paymentStatusLabel(status)}</Badge>;
  return <Badge variant="outline">{paymentStatusLabel(status)}</Badge>;
}

function PaymentRow({ row }: { row: PaymentDisplayRow }) {
  const showName = row.showName ?? EMPTY;
  const dateLabel = formatPaymentDate(row.date);
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap tabular-nums">{dateLabel}</TableCell>
      <TableCell className="max-w-[16rem] truncate font-medium" title={showName}>
        {showName}
      </TableCell>
      <TableCell className="max-w-[16rem] truncate" title={row.description}>
        {row.description}
      </TableCell>
      <TableCell className="text-right tabular-nums whitespace-nowrap">
        {formatPaymentCents(row.amountCents, row.currency)}
      </TableCell>
      <TableCell>{statusBadge(row.status)}</TableCell>
      <TableCell>
        {isRetryablePaymentStatus(row.status) && row.showId && row.entryIds.length > 0 ? (
          // Failed/cancelled: deep-link straight to the cart-recovery flow,
          // scoped to this order's show + entries, so the exhibitor can retry the
          // exact payment rather than rebuilding it from scratch under My Shows.
          <Link
            to={buildFinishPaymentHref(row.showId, row.entryIds)}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm text-primary hover:underline focus-visible:underline"
          >
            <CreditCard className="h-4 w-4 shrink-0" aria-hidden="true" />
            Finish payment
          </Link>
        ) : row.entryIds.length > 0 && !isRefundedPaymentStatus(row.status) ? (
          // Settled orders: the per-entry printable receipt lives on My Shows.
          // My Entries has no inbound entry/show filter, so this is a plain link
          // to that page (where the per-entry printable receipt lives), not a
          // row-scoped filter. The accessible name names the show so each link
          // is distinguishable when tabbing through the column.
          <Link
            to="/exhibitor/entries"
            aria-label={`Receipt for ${row.showName ?? 'this payment'} under My Shows`}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm text-primary hover:underline focus-visible:underline"
          >
            <ReceiptIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            Receipt
          </Link>
        ) : (
          // Match the link's min height so rows stay vertically even.
          <span className="inline-flex min-h-11 items-center text-muted-foreground">{EMPTY}</span>
        )}
      </TableCell>
    </TableRow>
  );
}

/**
 * At-a-glance net total from the same visible rows in the table, so refunds
 * cannot disappear from the header math.
 */
function PaymentsSummary({ rows }: { rows: PaymentDisplayRow[] }) {
  const totals = summarizePaymentDisplayRows(rows);
  if (totals.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {totals.map(t => (
        <Card key={t.currency} className="border-primary/40">
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">Total paid</p>
            <p className="text-2xl font-semibold tabular-nums text-primary">
              {formatPaymentCents(t.totalPaidCents, t.currency)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.paymentCount} {t.paymentCount === 1 ? 'payment' : 'payments'}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function ExhibitorPaymentsPage() {
  const { data: payments, isLoading, isError } = useMyPayments();
  const paymentRows = payments ? buildPaymentDisplayRows(payments) : [];

  useEffect(() => {
    if (isError) toast.error('Could not load your payments.');
  }, [isError]);

  return (
    <div className="container mx-auto px-6 py-8 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Payments</h1>
        <p className="text-muted-foreground">
          Your online entry payments. Receipts live with each entry under My Shows.
        </p>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="space-y-3 py-6">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-5/6" />
            <Skeleton className="h-6 w-4/6" />
            <Skeleton className="h-6 w-5/6" />
          </CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent role="alert" className="py-12 text-center text-muted-foreground">
            We couldn&apos;t load your payments. Please refresh to try again.
          </CardContent>
        </Card>
      ) : !payments || payments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No payments yet. When you pay for entries online, they&apos;ll appear here.
          </CardContent>
        </Card>
      ) : (
        <>
          <PaymentsSummary rows={paymentRows} />
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Show</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Receipt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentRows.map(row => (
                    <PaymentRow key={row.id} row={row} />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
