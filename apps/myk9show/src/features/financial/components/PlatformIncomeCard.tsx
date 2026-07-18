// Platform income + attention section for /admin/payouts (unified-financial-
// dashboard, MYK9-54, task 4.1). Presents THREE figures SEPARATELY, each with a
// source/formula label, so gross fee income, net income, and outstanding transfer
// liability are never confused (design.md decision 2 + risk "users confuse gross
// fees with net income"). Calm oversight per docs/INTENT.md's site-admin feeling:
// normal pending/self-healing states never render red — see platformAttention.ts.
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  tone?: 'default' | 'pending';
}

function Figure({ label, value, formula, tone = 'default' }: FigureProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={`text-2xl tabular-nums ${tone === 'pending' ? 'text-muted-foreground' : ''}`}
        >
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">Source: {formula}</p>
      </CardContent>
    </Card>
  );
}

function PlatformFigures({ income }: { income: PlatformIncomeSummary }) {
  const { availableCents, pendingResidualCents, pendingOrderCount } = income.netPlatformIncome;

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
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
    </div>
  );
}

/** One-time (non-entry) charges, net of refunds. Kept as its own figure so this
 *  money is visible without ever entering entry accounting — and so a
 *  fully-refunded one-time payment stops reading at full gross. */
function NonEntryCharges({ income }: { income: PlatformIncomeSummary }) {
  const { orderCount, grossCents, refundedCents, makeWholeRefundedCents, netCents } =
    income.nonEntry;
  if (orderCount === 0) return null;
  const refundedTotal = refundedCents + makeWholeRefundedCents;

  return (
    <Figure
      label="One-time payments (net)"
      value={formatCents(netCents)}
      formula={
        `${orderCount} non-entry charge${orderCount === 1 ? '' : 's'} totalling ` +
        `${formatCents(grossCents)} gross, less ${formatCents(refundedTotal)} refunded. ` +
        'Reported separately — never counted as entry collections or fee income.'
      }
    />
  );
}

function OutstandingLiability({ payoutSettlement }: { payoutSettlement: PayoutSettlementTotals }) {
  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-2">
        <CardDescription>Outstanding transfer liability</CardDescription>
        <CardTitle className="text-2xl tabular-nums text-primary">
          {formatCents(payoutSettlement.outstandingCents)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">
          Source: pending + processing Stripe transfers not yet completed
          {payoutSettlement.failedCents > 0
            ? `, plus ${formatCents(payoutSettlement.failedCents)} in ${payoutSettlement.failedCount} failed transfer(s) still owed (retried failures excluded)`
            : ''}
          .
        </p>
      </CardContent>
    </Card>
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
          Recorded facts only — a normal pending or self-healing payout never appears here, and no
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

function PlatformIncomeError() {
  return (
    <Card>
      <CardContent className="py-10 text-center">
        <p className="font-medium">Could not load platform financial reconciliation.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Figures are unavailable right now, not zero. Refresh to try again.
        </p>
      </CardContent>
    </Card>
  );
}

export function PlatformIncomeCard() {
  const { data, isLoading, isError } = usePlatformFinancialOverview();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return <PlatformIncomeError />;
  }

  return (
    <div className="space-y-4">
      <PlatformFigures income={data.summary.platformIncome} />
      <NonEntryCharges income={data.summary.platformIncome} />
      <OutstandingLiability payoutSettlement={data.summary.payoutSettlement} />
      <AttentionSection attention={data.attention} detailTruncated={data.detailTruncated} />
    </div>
  );
}
