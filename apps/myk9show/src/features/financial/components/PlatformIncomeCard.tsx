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
  const netFigure =
    income.netPlatformIncome.status === 'available'
      ? {
          value: formatCents(income.netPlatformIncome.netCents),
          tone: 'default' as const,
        }
      : {
          value: `Pending (${income.processingFeePendingCount})`,
          tone: 'pending' as const,
        };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Figure
        label="Online collected"
        value={formatCents(income.onlineCollectedCents)}
        formula="Gross charged − refunded"
      />
      <Figure
        label="Gross platform-fee income"
        value={formatCents(income.grossPlatformFeeCents)}
        formula="Sum of the platform-fee snapshot on each online order"
      />
      <Figure
        label="Net platform income"
        value={netFigure.value}
        tone={netFigure.tone}
        formula="Gross fee income − captured Stripe processing fees"
      />
    </div>
  );
}

function OutstandingLiability({ payoutSettlement }: { payoutSettlement: PayoutSettlementTotals }) {
  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-2">
        <CardDescription>Outstanding transfer liability</CardDescription>
        <CardTitle className="text-2xl tabular-nums text-primary">
          {formatCents(payoutSettlement.pendingCents)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">
          Source: pending + processing Stripe transfers not yet completed.
        </p>
      </CardContent>
    </Card>
  );
}

function AttentionSection({ attention }: { attention: PlatformAttentionSummary }) {
  if (attention.totalCount === 0) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center gap-3 text-muted-foreground">
          <ShieldCheck className="h-5 w-5 text-success" />
          <p className="text-sm">No reconciliation attention items. Everything ties out.</p>
        </CardContent>
      </Card>
    );
  }

  const items: Array<{ key: string; label: string; count: number }> = [
    { key: 'failed', label: 'Failed transfers', count: attention.failedTransferCount },
    { key: 'refund', label: 'Unrecorded refunds', count: attention.unrecordedRefundCount },
    {
      key: 'fee',
      label: 'Missing processing-fee snapshots',
      count: attention.missingProcessingFeeCount,
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
          Genuine drift only — a normal pending or self-healing payout never appears here.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {items.map(item => (
          <Badge key={item.key} variant="destructive">
            {item.label}: {item.count}
          </Badge>
        ))}
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
      <OutstandingLiability payoutSettlement={data.summary.payoutSettlement} />
      <AttentionSection attention={data.attention} />
    </div>
  );
}
