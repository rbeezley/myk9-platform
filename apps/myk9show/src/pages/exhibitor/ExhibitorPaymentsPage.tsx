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
import { Receipt as ReceiptIcon, CreditCard, WalletCards } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useElementWidth } from '@/hooks/useElementWidth';
import { useMyPayments } from '@/features/payments/useMyPayments';
import { useMyEntryBalanceSummary } from '@/features/payments/useMyEntryBalanceSummary';
import { buildFinishPaymentHref } from '@/features/payments/finishPaymentHref';
import type { EntryBalanceSummary } from '@/features/payments/entryBalanceSummary';
import {
  buildPaymentDisplayRows,
  formatPaymentCents,
  formatPaymentDate,
  isRefundedPaymentStatus,
  isRetryablePaymentStatus,
  paymentStatusLabel,
  type PaymentDisplayRow,
} from '@/features/payments/moneyPresentation';
import { summarizePaymentLedgerTotals } from '@/features/payments/paymentsSummary';

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

/**
 * The row's action affordance — retry link, receipt link, or a dash. Shared
 * between the desktop table cell and the mobile card summary so the two
 * layouts never drift on what a row can do.
 */
function PaymentActionContent({ row }: { row: PaymentDisplayRow }) {
  if (isRetryablePaymentStatus(row.status) && row.showId && row.entryIds.length > 0) {
    // Failed/cancelled: deep-link straight to the cart-recovery flow,
    // scoped to this order's show + entries, so the exhibitor can retry the
    // exact payment rather than rebuilding it from scratch under My Shows.
    return (
      <Link
        to={buildFinishPaymentHref(row.showId, row.entryIds)}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-primary hover:underline focus-visible:underline"
      >
        <CreditCard className="h-4 w-4 shrink-0" aria-hidden="true" />
        Finish payment
      </Link>
    );
  }

  if (row.entryIds.length > 0 && !isRefundedPaymentStatus(row.status)) {
    // Settled orders: the per-entry printable receipt lives on My Shows.
    // My Entries has no inbound entry/show filter, so this is a plain link
    // to that page (where the per-entry printable receipt lives), not a
    // row-scoped filter. The accessible name names the show so each link
    // is distinguishable when tabbing through the column.
    return (
      <Link
        to="/exhibitor/entries"
        aria-label={`Receipt for ${row.showName ?? 'this payment'} under My Shows`}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-primary hover:underline focus-visible:underline"
      >
        <ReceiptIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
        Receipt
      </Link>
    );
  }

  // No retry and no receipt (refunded, or an order with no linked entries) —
  // say so explicitly rather than a bare dash, which an assistive-tech user
  // hovering "Receipt: -" can't distinguish from a truncated reference
  // number. Match the link's min height so rows stay vertically even.
  return (
    <span className="inline-flex min-h-11 items-center text-sm text-muted-foreground">
      {isRefundedPaymentStatus(row.status) ? 'No receipt (refunded)' : 'No receipt available'}
    </span>
  );
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
        <PaymentActionContent row={row} />
      </TableCell>
    </TableRow>
  );
}

/**
 * Phone-width disclosure for a single payment. The desktop table hides
 * amount/status/receipt past the viewport edge on a 390px phone (MYK9-71
 * elderly/novice audit finding) — this stacks the same three facts as
 * labeled rows instead, so nothing that already renders in `PaymentRow` is
 * duplicated, only reshaped.
 */
function PaymentCard({ row }: { row: PaymentDisplayRow }) {
  const showName = row.showName ?? EMPTY;
  const dateLabel = formatPaymentDate(row.date);
  return (
    <div
      role="group"
      aria-label={`Payment for ${showName} on ${dateLabel}`}
      className="space-y-2 border-b border-border/60 px-4 py-4 last:border-b-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium" title={showName}>
            {showName}
          </p>
          <p className="truncate text-sm text-muted-foreground" title={row.description}>
            {row.description}
          </p>
        </div>
        <p className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">{dateLabel}</p>
      </div>
      <dl className="flex items-center justify-between gap-3">
        <div>
          <dt className="text-xs text-muted-foreground">Amount</dt>
          <dd
            className="text-lg font-semibold tabular-nums"
            aria-label={`Amount: ${formatPaymentCents(row.amountCents, row.currency)}`}
          >
            {formatPaymentCents(row.amountCents, row.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Status</dt>
          <dd aria-label={`Status: ${paymentStatusLabel(row.status)}`}>
            {statusBadge(row.status)}
          </dd>
        </div>
      </dl>
      <div>
        <span id={`payment-receipt-label-${row.id}`} className="text-xs text-muted-foreground">
          Receipt
        </span>
        <div aria-labelledby={`payment-receipt-label-${row.id}`}>
          <PaymentActionContent row={row} />
        </div>
      </div>
    </div>
  );
}

/**
 * At-a-glance net total from the same visible rows in the table, so refunds
 * cannot disappear from the header math.
 */
function PaymentsSummary({ rows }: { rows: PaymentDisplayRow[] }) {
  const totals = summarizePaymentLedgerTotals(rows);
  if (totals.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {totals.map(t => (
        <Card key={t.currency} className="border-primary/40">
          <CardContent className="py-4">
            <p className="text-sm font-medium text-muted-foreground">Payment history</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Gross paid</p>
                <p className="text-xl font-semibold tabular-nums">
                  {formatPaymentCents(t.grossPaidCents, t.currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Refunds</p>
                <p className="text-xl font-semibold tabular-nums text-muted-foreground">
                  {formatPaymentCents(-t.refundCents, t.currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Net paid</p>
                <p className="text-xl font-semibold tabular-nums text-primary">
                  {formatPaymentCents(t.netPaidCents, t.currency)}
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {t.paymentCount} {t.paymentCount === 1 ? 'payment' : 'payments'}
              {t.refundCount > 0
                ? `, ${t.refundCount} ${t.refundCount === 1 ? 'refund' : 'refunds'}`
                : ''}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AmountDueSection({
  summary,
  isLoading,
  isError,
}: {
  summary: EntryBalanceSummary | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 py-5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-5 w-5/6" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent role="alert" className="py-5 text-sm text-muted-foreground">
          We couldn&apos;t load your current balance. Your payment history is still below.
        </CardContent>
      </Card>
    );
  }

  if (!summary || summary.amountDueCents <= 0) {
    return (
      <Card className="border-success/30">
        <CardContent className="flex flex-col gap-2 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Amount due</p>
            <p className="text-2xl font-semibold tabular-nums text-success">$0.00</p>
          </div>
          <p className="text-sm text-muted-foreground">Current entries are paid up.</p>
        </CardContent>
      </Card>
    );
  }

  const singleOnlineShowBalance =
    summary.onlineShowBalances.length === 1 ? summary.onlineShowBalances[0] : null;
  const singleOnlineCoversFullDue =
    summary.onlineDueCents === summary.amountDueCents && summary.payAtShowDueCents === 0;
  const singleOnlineButtonLabel =
    singleOnlineShowBalance && singleOnlineCoversFullDue
      ? 'Finish payment'
      : singleOnlineShowBalance
        ? `Pay ${formatPaymentCents(singleOnlineShowBalance.onlineDueCents, 'usd')} online`
        : null;

  return (
    <Card className="border-warning/40">
      <CardContent className="space-y-4 py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Amount due</p>
            <p className="text-3xl font-semibold tabular-nums text-warning">
              {formatPaymentCents(summary.amountDueCents, 'usd')}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              This matches Current Fees on My Shows for current entries.
            </p>
          </div>
          {singleOnlineShowBalance && singleOnlineButtonLabel && (
            <Button asChild className="min-h-11 shrink-0">
              <Link to={singleOnlineShowBalance.paymentHref}>
                <CreditCard className="h-4 w-4 mr-1.5" />
                {singleOnlineButtonLabel}
              </Link>
            </Button>
          )}
        </div>

        {summary.onlineShowBalances.length > 1 && (
          <div className="space-y-2">
            {summary.onlineShowBalances.map(show => (
              <div
                key={show.showId}
                className="flex flex-col gap-2 rounded-md border border-border/60 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm font-medium">{show.showName}</span>
                <Button asChild variant="outline" size="sm" className="min-h-11">
                  <Link to={show.paymentHref}>
                    Pay {formatPaymentCents(show.onlineDueCents, 'usd')}
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        )}

        {summary.payAtShowDueCents > 0 && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <WalletCards className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {formatPaymentCents(summary.payAtShowDueCents, 'usd')} is marked pay at show. Check each
            entry under My Shows for cash or check instructions.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Below this measured container width the desktop table's Description and
 * Date columns no longer fit alongside Amount/Status/Receipt, so those three
 * facts are reshaped into stacked cards instead. */
const MOBILE_BREAKPOINT = 640;

/**
 * Payment history, container-width aware. Desktop keeps the existing table;
 * a measured-narrow container (phones) reshapes the same rows into labeled
 * cards so amount/status/receipt stay discoverable without a horizontal
 * scroll or hidden columns. `PaymentRow` and `PaymentCard` share the same
 * action logic (`PaymentActionContent`) so nothing is duplicated, only
 * relaid out.
 */
function PaymentsHistoryList({ rows }: { rows: PaymentDisplayRow[] }) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const isNarrow = width !== null && width < MOBILE_BREAKPOINT;

  return (
    <Card>
      <CardContent ref={ref} className="p-0">
        {isNarrow ? (
          <div>
            {rows.map(row => (
              <PaymentCard key={row.id} row={row} />
            ))}
          </div>
        ) : (
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
              {rows.map(row => (
                <PaymentRow key={row.id} row={row} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function ExhibitorPaymentsPage() {
  const { data: payments, isLoading, isError } = useMyPayments();
  const {
    data: balanceSummary,
    isLoading: isBalanceLoading,
    isError: isBalanceError,
  } = useMyEntryBalanceSummary();
  const paymentRows = payments ? buildPaymentDisplayRows(payments) : [];

  useEffect(() => {
    if (isError) toast.error('Could not load your payments.');
  }, [isError]);

  return (
    <div className="container mx-auto px-6 py-8 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Payments</h1>
        <p className="text-muted-foreground">
          Current balances and online entry payments. Receipts live with each entry under My Shows.
        </p>
      </div>

      <AmountDueSection
        summary={balanceSummary}
        isLoading={isBalanceLoading}
        isError={isBalanceError}
      />

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
          <PaymentsHistoryList rows={paymentRows} />
        </>
      )}
    </div>
  );
}
