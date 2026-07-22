/**
 * PayoutLedgerPage — site-admin payout ledger + platform fee setting.
 *
 * Two halves on one page (per the 2026-06-10 decision):
 *  - Platform fee: the one place to change platform_settings.platform_fee_percent
 *    with no deploy (read by stripe-checkout + the cart preview).
 *  - Payout ledger: cross-club liabilities — "whose money is in the platform's
 *    Stripe balance right now?" The operator-only complement to ClubPaymentsCard.
 *
 * Behind the SITE_ADMIN route guard; writes are also RLS + trigger gated.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Wallet, Percent, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlatformFeePercent } from '@/hooks/queries/usePlatformFeePercent';
import { useUpdatePlatformFee } from '@/features/payments/useUpdatePlatformFee';
import { usePlatformPayoutLedger } from '@/features/payments/usePlatformPayoutLedger';
import {
  summarizeLedger,
  type LedgerRow,
  type PayoutStatus,
} from '@/features/payments/payoutLedger';
import { PlatformIncomeCard } from '@/features/financial/components/PlatformIncomeCard';
import { getPayoutStatusPresentation } from './adminStatusPresentation';

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** A refund reduces what the club is owed, so show it as a signed deduction. */
function formatRefundCents(cents: number): string {
  return cents > 0 ? `-${formatCents(cents)}` : formatCents(0);
}

function statusBadge(status: PayoutStatus | null) {
  if (!status) return <Badge variant="outline">Not settled</Badge>;
  const presentation = getPayoutStatusPresentation(status);
  return <Badge className={presentation.className}>{presentation.label}</Badge>;
}

function PlatformFeeCard() {
  const currentPercent = usePlatformFeePercent();
  const updateFee = useUpdatePlatformFee();
  const [value, setValue] = useState<string>(String(currentPercent));

  // Resync the field when the fetched rate changes (initial load / refetch),
  // following the adjust-state-during-render pattern (no setState in effect).
  const [syncedFrom, setSyncedFrom] = useState<number>(currentPercent);
  if (syncedFrom !== currentPercent) {
    setSyncedFrom(currentPercent);
    setValue(String(currentPercent));
  }

  const parsed = Number(value);
  const invalid = !Number.isFinite(parsed) || parsed < 0 || parsed > 20;
  const unchanged = parsed === currentPercent;

  const handleSave = () => {
    updateFee.mutate(parsed, {
      onSuccess: p => toast.success(`Platform fee updated to ${p}%`),
      onError: e => toast.error(e instanceof Error ? e.message : 'Failed to update platform fee'),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Percent className="h-5 w-5" />
          Platform Fee
        </CardTitle>
        <CardDescription>
          The percentage added to each online entry checkout. Charged by Stripe and shown in the
          cart preview. Changing it here takes effect immediately — no deploy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="platform-fee-percent">Fee percent</Label>
            <div className="flex items-center gap-2">
              <Input
                id="platform-fee-percent"
                type="number"
                min={0}
                max={20}
                step={0.5}
                value={value}
                onChange={e => setValue(e.target.value)}
                className="w-28"
              />
              <span className="text-muted-foreground">%</span>
            </div>
          </div>
          <Button onClick={handleSave} disabled={invalid || unchanged || updateFee.isPending}>
            {updateFee.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
        {invalid && <p className="text-sm text-destructive">Enter a percent between 0 and 20.</p>}
        <p className="text-sm text-muted-foreground">
          Current rate: <span className="font-medium text-foreground">{currentPercent}%</span>
        </p>
      </CardContent>
    </Card>
  );
}

function LedgerSummary({ rows }: { rows: LedgerRow[] }) {
  const { outstandingCents, paidOutCents } = summarizeLedger(rows);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Card className="border-primary/40">
        <CardHeader className="pb-2">
          <CardDescription>Outstanding to clubs</CardDescription>
          <CardTitle className="text-2xl tabular-nums text-primary">
            {formatCents(outstandingCents)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Online fees collected but not yet transferred.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Paid out to date</CardDescription>
          <CardTitle className="text-2xl tabular-nums">{formatCents(paidOutCents)}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Completed Stripe transfers.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function LedgerError() {
  return (
    <Card>
      <CardContent className="py-10 text-center">
        <p className="font-medium">Could not load the payout ledger.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Amounts are unavailable right now, not zero. Refresh to try again.
        </p>
      </CardContent>
    </Card>
  );
}

function LedgerTable({ rows }: { rows: LedgerRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          No online payments yet. Club liabilities appear here once exhibitors pay online.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Club</TableHead>
              <TableHead>Show</TableHead>
              <TableHead className="text-right">Online collected</TableHead>
              <TableHead className="text-right">Refunds</TableHead>
              <TableHead className="text-right">Net owed</TableHead>
              <TableHead>Settle date</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => (
              <TableRow key={row.showId}>
                <TableCell className="font-medium">
                  {row.clubName ?? <span className="text-muted-foreground">Unknown club</span>}
                </TableCell>
                <TableCell>{row.showName}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCents(row.onlineCollectedCents)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatRefundCents(row.refundedCents)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatCents(row.netOwedCents)}
                </TableCell>
                <TableCell className="tabular-nums">
                  {row.settleDate ?? <span className="text-muted-foreground">Not scheduled</span>}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {statusBadge(row.payoutStatus)}
                    {row.stripeTransferId && (
                      <span
                        className="inline-block max-w-[10rem] truncate font-mono text-xs text-muted-foreground"
                        title={`Stripe transfer ${row.stripeTransferId}`}
                      >
                        {row.stripeTransferId}
                      </span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function RefundDecisionAdvisory({ rows }: { rows: LedgerRow[] }) {
  const unresolvedRows = rows.filter(row => row.unresolvedRefundDecisionCount > 0);
  if (unresolvedRows.length === 0) return null;

  const total = unresolvedRows.reduce((sum, row) => sum + row.unresolvedRefundDecisionCount, 0);

  return (
    <Alert>
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="space-y-2">
        <p>
          {total} pulled {total === 1 ? 'entry' : 'entries'} with unresolved refund decisions.
          Resolve before payout or handle out-of-band.
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {unresolvedRows.map(row => (
            <Link
              key={row.showId}
              className="font-medium text-primary underline underline-offset-4"
              to={`/shows/${encodeURIComponent(row.showId)}/entry-management?attention=pulled`}
              aria-label={`Review pulled entries for ${row.showName}`}
            >
              {row.showName} ({row.unresolvedRefundDecisionCount})
            </Link>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}

export default function PayoutLedgerPage() {
  const { data: rows, isLoading, isError } = usePlatformPayoutLedger();

  // Surface load failures without leaving the page blank (often RLS — only site
  // admins may read the cross-club entries/payouts this ledger joins).
  useEffect(() => {
    if (isError) toast.error('Could not load the payout ledger.');
  }, [isError]);

  return (
    <div className="container mx-auto px-6 py-8 max-w-6xl space-y-8">
      <div className="flex items-center gap-3">
        <Wallet className="h-7 w-7" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payments &amp; Payouts</h1>
          <p className="text-muted-foreground">Platform fee and cross-club payout liabilities.</p>
        </div>
      </div>

      <PlatformFeeCard />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Platform income</h2>
        <PlatformIncomeCard />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Payout ledger</h2>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : isError ? (
          <LedgerError />
        ) : (
          <>
            <LedgerSummary rows={rows ?? []} />
            <RefundDecisionAdvisory rows={rows ?? []} />
            <LedgerTable rows={rows ?? []} />
          </>
        )}
      </section>
    </div>
  );
}
