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
import { useMyPayments, type MyPayment } from '@/features/payments/useMyPayments';
import { buildFinishPaymentHref } from '@/features/payments/finishPaymentHref';

function isRetryable(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'failed' || s === 'cancelled';
}

/** Placeholder for a missing cell value. Hyphen-minus, never an em dash (UI-copy rule). */
const EMPTY = '-';

function isRefunded(status: string): boolean {
  return status.toLowerCase() === 'refunded';
}

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

/**
 * Display amount for a row. A refunded order returns to the exhibitor, so render
 * it as a signed deduction (e.g. "-$53.00") to distinguish it from a charge —
 * matching the Payout Ledger's signed-refund convention. Presentation only: the
 * stored amount is unchanged.
 */
function formatRowAmount(payment: MyPayment): string {
  const formatted = formatCents(payment.amountCents, payment.currency);
  return isRefunded(payment.status) ? `-${formatted}` : formatted;
}

function formatDate(iso: string | null): string {
  if (!iso) return EMPTY;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return EMPTY;
  // Explicit month-name format so the date is unambiguous in every locale
  // (avoids 6/7 vs 7/6 confusion on a money record).
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Humane label for every status the order feed can emit. */
function statusLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === 'succeeded' || s === 'paid') return 'Paid';
  if (s === 'refunded') return 'Refunded';
  if (s === 'failed') return 'Failed';
  if (s === 'cancelled' || s === 'canceled') return 'Cancelled';
  if (s === 'pending') return 'Pending';
  if (s === 'processing') return 'Processing';
  if (s === 'unknown' || s === '') return 'Unknown';
  // Last resort: title-case the raw token rather than leak a lowercase id.
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === 'succeeded' || s === 'paid')
    return <Badge variant="default">{statusLabel(status)}</Badge>;
  if (s === 'refunded') return <Badge variant="secondary">{statusLabel(status)}</Badge>;
  if (s === 'failed' || s === 'cancelled' || s === 'canceled')
    return <Badge variant="destructive">{statusLabel(status)}</Badge>;
  return <Badge variant="outline">{statusLabel(status)}</Badge>;
}

function PaymentRow({ payment }: { payment: MyPayment }) {
  const showName = payment.showName ?? EMPTY;
  const dateLabel = formatDate(payment.date);
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap tabular-nums">{dateLabel}</TableCell>
      <TableCell className="max-w-[16rem] truncate font-medium" title={showName}>
        {showName}
      </TableCell>
      {/* Keep the figure at full foreground for legibility; the leading "-" and
          the "Refunded" badge carry the refund meaning, not muting. */}
      <TableCell className="text-right tabular-nums whitespace-nowrap">
        {formatRowAmount(payment)}
      </TableCell>
      <TableCell>{statusBadge(payment.status)}</TableCell>
      <TableCell
        className="max-w-[12rem] truncate font-mono text-sm text-muted-foreground"
        title={payment.reference ?? undefined}
      >
        {payment.reference ?? EMPTY}
      </TableCell>
      <TableCell>
        {isRetryable(payment.status) && payment.showId && payment.entryIds.length > 0 ? (
          // Failed/cancelled: deep-link straight to the cart-recovery flow,
          // scoped to this order's show + entries, so the exhibitor can retry the
          // exact payment rather than rebuilding it from scratch under My Shows.
          <Link
            to={buildFinishPaymentHref(payment.showId, payment.entryIds)}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm text-primary hover:underline focus-visible:underline"
          >
            <CreditCard className="h-4 w-4 shrink-0" aria-hidden="true" />
            Finish payment
          </Link>
        ) : payment.entryIds.length > 0 ? (
          // Settled orders: the per-entry printable receipt lives on My Shows.
          // My Entries has no inbound entry/show filter, so this is a plain link
          // to that page (where the per-entry printable receipt lives), not a
          // row-scoped filter. The accessible name names the show so each link
          // is distinguishable when tabbing through the column.
          <Link
            to="/exhibitor/entries"
            aria-label={`Find the receipt for ${
              payment.showName ?? 'this payment'
            } under My Shows`}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm text-primary hover:underline focus-visible:underline"
          >
            <ReceiptIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            Find receipt
          </Link>
        ) : (
          // Match the link's min height so rows stay vertically even.
          <span className="inline-flex min-h-11 items-center text-muted-foreground">
            {EMPTY}
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

export default function ExhibitorPaymentsPage() {
  const { data: payments, isLoading, isError } = useMyPayments();

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
          <CardContent
            role="alert"
            className="py-12 text-center text-muted-foreground"
          >
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
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Show</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map(p => (
                  <PaymentRow key={p.id} payment={p} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
