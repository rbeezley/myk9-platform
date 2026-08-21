// Platform income + attention section for /admin/payouts (unified-financial-
// dashboard, MYK9-54, task 4.1). Presents THREE figures SEPARATELY, each with a
// source/formula label, so gross fee income, net income, and outstanding transfer
// liability are never confused (design.md decision 2 + risk "users confuse gross
// fees with net income"). Calm oversight per docs/INTENT.md's site-admin feeling:
// normal pending/self-healing states never render red — see platformAttention.ts.
import { AlertTriangle, ChevronDown, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { PlatformIncomeSummary, PayoutSettlementTotals } from '@/features/financial';
import type { PlatformAttentionSummary } from './platformAttention';
import { usePlatformFinancialOverview } from './usePlatformFinancialOverview';

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

interface FigureProps {
  label: string;
  value: string;
  formula: string;
}

function Figure({ label, value, formula }: FigureProps) {
  return (
    <div
      className="min-w-0 border-b border-border p-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
    >
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</dd>
      <dd>
        <details className="group mt-3 text-xs text-muted-foreground">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium text-[color-mix(in_srgb,var(--foreground)_80%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            How this is calculated
            <ChevronDown
              aria-hidden
              className="size-3.5 transition-transform group-open:rotate-180"
            />
          </summary>
          <p className="pb-1 leading-relaxed">{formula}</p>
        </details>
      </dd>
    </div>
  );
}

function PlatformFigures({ income }: { income: PlatformIncomeSummary }) {
  const { availableCents, pendingResidualCents, pendingOrderCount } = income.netPlatformIncome;
  const { orderCount, grossCents, refundedCents, makeWholeRefundedCents, netCents } =
    income.nonEntry;
  const refundedTotal = refundedCents + makeWholeRefundedCents;

  // The net figure is ALWAYS a real number now. It used to read "Pending" the
  // moment a single order's Stripe balance transaction was delayed, which — since
  // nothing retries the fee capture — would have disabled the headline number for
  // good. The orders whose processing cost is still unknown are named in the
  // note below instead of silently disappearing into a zero.
  const pendingNote =
    pendingOrderCount > 0
      ? ` Excludes ${pendingOrderCount} order${pendingOrderCount === 1 ? '' : 's'} ` +
        `whose Stripe processing fee is not captured yet ` +
        `(up to ${formatCents(pendingResidualCents)} of fee income still to net out).`
      : '';

  return (
    <Card role="group" aria-label="Platform income overview" className="overflow-hidden">
      <dl
        className={`grid grid-cols-1 sm:grid-cols-2 ${orderCount > 0 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}
      >
        <Figure
          label="Online collected"
          value={formatCents(income.onlineCollectedCents)}
          formula="Gross charged − post-hoc refunds − cart-overflow make-whole refunds"
        />
        <Figure
          label="Gross platform-fee income"
          value={formatCents(income.grossPlatformFeeCents)}
          formula="Sum of the platform-fee snapshot on each online order"
        />
        {/* Cart-overflow make-whole refunds are excluded from the net formula on
            purpose: the platform earned no fee and made no transfer on those
            lines, so returning that money is not a loss. Only post-hoc refunds on
            accepted entries are — and the two now arrive as separate explicit
            columns, so neither figure re-derives the split. */}
        <Figure
          label={pendingOrderCount > 0 ? 'Net platform income so far' : 'Net platform income'}
          value={formatCents(availableCents)}
          formula={
            'Fee income − captured Stripe processing fees − post-hoc refunds the platform absorbed, ' +
            'over the orders whose processing fee is captured.' +
            pendingNote
          }
        />
        {orderCount > 0 && (
          <Figure
            label="One-time payments (net)"
            value={formatCents(netCents)}
            formula={
              `${orderCount} non-entry charge${orderCount === 1 ? '' : 's'} totalling ` +
              `${formatCents(grossCents)} gross, less ${formatCents(refundedTotal)} refunded. ` +
              'Reported separately and never counted as entry collections or fee income.'
            }
          />
        )}
      </dl>
    </Card>
  );
}

function OutstandingLiability({ payoutSettlement }: { payoutSettlement: PayoutSettlementTotals }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[color-mix(in_srgb,var(--primary)_30%,transparent)] bg-[color-mix(in_srgb,var(--primary)_5%,transparent)] p-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="max-w-3xl">
        {/* NOT "in flight to Stripe": the cron writes a pending row even when a
            club has not finished Stripe onboarding, and failed rows are counted
            here too — so a Stripe transfer may never have been attempted. What
            these amounts have in common is a payout RECORD, not a transfer. */}
        <p className="text-sm font-medium text-foreground">Owed where a payout record exists</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Source: pending + processing Stripe transfers not yet completed
          {payoutSettlement.failedCents > 0
            ? `, plus ${formatCents(payoutSettlement.failedCents)} in ${payoutSettlement.failedCount} failed transfer(s) still owed (retried failures excluded)`
            : ''}
          .
        </p>
      </div>
      <p className="shrink-0 text-xl font-semibold tabular-nums text-primary">
        {formatCents(payoutSettlement.outstandingCents)}
      </p>
    </div>
  );
}

function TruncationNote() {
  return (
    <p className="text-xs text-muted-foreground">
      Showing a partial scan: more reconciliation rows exist than this view walked, so these counts
      are a minimum.
    </p>
  );
}

function AttentionSection({
  attention,
  detailTruncated,
}: {
  attention: PlatformAttentionSummary;
  detailTruncated: boolean;
}) {
  if (attention.totalCount === 0) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center gap-3 text-muted-foreground">
          <ShieldCheck className="h-5 w-5 text-success" />
          <div>
            <p className="text-sm">No reconciliation attention items. Everything ties out.</p>
            {detailTruncated ? <TruncationNote /> : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  const items: Array<{ key: string; label: string; count: number }> = [
    { key: 'failed', label: 'Failed transfers', count: attention.failedTransferCount },
    {
      key: 'fee',
      label: 'Missing platform-fee snapshots',
      count: attention.missingPlatformFeeSnapshotCount,
    },
  ].filter(item => item.count > 0);

  return (
    <Card className="border-destructive/40">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          Reconciliation attention
        </CardTitle>
        <CardDescription>
          Recorded facts only. A normal pending or self-healing payout never appears here, and no
          item here is inferred from the numbers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {items.map(item => (
            <Badge key={item.key} variant="destructive">
              {item.label}: {item.count}
            </Badge>
          ))}
        </div>
        {detailTruncated ? <TruncationNote /> : null}
      </CardContent>
    </Card>
  );
}

function PlatformIncomeError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card role="alert">
      <CardContent className="py-10 text-center">
        <p className="font-medium">Could not load platform financial reconciliation.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Figures are unavailable right now, not zero. The payout ledger below loads separately.
        </p>
        {/* Not variant="outline" — bg-secondary === --card in dark, so the
            control measures 1.00:1 against this card. See PayoutLedgerPage. */}
        <Button className="mt-4 min-h-11" onClick={onRetry}>
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}

export function PlatformIncomeCard() {
  const { data, isLoading, isError, refetch } = usePlatformFinancialOverview();

  if (isLoading) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading platform income">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return <PlatformIncomeError onRetry={() => void refetch()} />;
  }

  return (
    <div className="space-y-4">
      <PlatformFigures income={data.summary.platformIncome} />
      <OutstandingLiability payoutSettlement={data.summary.payoutSettlement} />
      <AttentionSection attention={data.attention} detailTruncated={data.detailTruncated} />
    </div>
  );
}
