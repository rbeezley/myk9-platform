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

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === 'succeeded' || s === 'paid') return <Badge variant="default">Paid</Badge>;
  if (s === 'refunded') return <Badge variant="secondary">Refunded</Badge>;
  if (s === 'failed' || s === 'cancelled') return <Badge variant="destructive">{status}</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function PaymentRow({ payment }: { payment: MyPayment }) {
  return (
    <TableRow>
      <TableCell>{formatDate(payment.date)}</TableCell>
      <TableCell className="font-medium">{payment.showName ?? '—'}</TableCell>
      <TableCell className="text-right">
        {formatCents(payment.amountCents, payment.currency)}
      </TableCell>
      <TableCell>{statusBadge(payment.status)}</TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {payment.reference ?? '—'}
      </TableCell>
      <TableCell>
        {isRetryable(payment.status) && payment.showId && payment.entryIds.length > 0 ? (
          // Failed/cancelled: deep-link straight to the cart-recovery flow,
          // scoped to this order's show + entries, so the exhibitor can retry the
          // exact payment rather than rebuilding it from scratch under My Shows.
          <Link
            to={buildFinishPaymentHref(payment.showId, payment.entryIds)}
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <CreditCard className="h-4 w-4" />
            Finish payment
          </Link>
        ) : payment.entryIds.length > 0 ? (
          // Settled orders: the per-entry printable receipt lives on My Shows.
          // My Entries has no inbound entry/show filter, so this is a plain link
          // to that page, not a row-scoped filter — the label says so to avoid
          // implying otherwise.
          <Link
            to="/exhibitor/entries"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <ReceiptIcon className="h-4 w-4" />
            My Shows
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
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
        <Skeleton className="h-64 w-full" />
      ) : isError ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
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
