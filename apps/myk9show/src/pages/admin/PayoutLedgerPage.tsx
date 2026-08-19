/**
 * PayoutLedgerPage — site-admin payout ledger + platform fee setting.
 *
 * Two financial responsibilities on one page (per the 2026-06-10 decision):
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
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card';
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

const MIN_PLATFORM_FEE_PERCENT = 0;
const MAX_PLATFORM_FEE_PERCENT = 20;

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
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(
    null
  );

  // Resync the field when the fetched rate changes (initial load / refetch),
  // following the adjust-state-during-render pattern (no setState in effect).
  const [syncedFrom, setSyncedFrom] = useState<number>(currentPercent);
  if (syncedFrom !== currentPercent) {
    setSyncedFrom(currentPercent);
    setValue(String(currentPercent));
  }

  const parsed = Number(value);
  const invalid =
    !Number.isFinite(parsed) ||
    parsed < MIN_PLATFORM_FEE_PERCENT ||
    parsed > MAX_PLATFORM_FEE_PERCENT;
  const unchanged = parsed === currentPercent;

  const handleSave = () => {
    updateFee.mutate(parsed, {
      onSuccess: p => {
        const message = `Platform fee updated to ${p}%`;
        setFeedback({ tone: 'success', message });
        toast.success(message);
      },
      onError: () => {
        const message = 'Could not update the platform fee. Try again.';
        setFeedback({ tone: 'error', message });
        toast.error(message);
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <Percent aria-hidden className="h-5 w-5" />
          Platform fee
        </h3>
        <CardDescription className="max-w-3xl leading-relaxed">
          This percentage is added to every online entry checkout and shown in the cart. Updating it
          takes effect immediately. No deployment is needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="platform-fee-percent">Fee percent</Label>
            <div className="flex items-center gap-2">
              <Input
                id="platform-fee-percent"
                type="number"
                min={MIN_PLATFORM_FEE_PERCENT}
                max={MAX_PLATFORM_FEE_PERCENT}
                step={0.5}
                value={value}
                onChange={e => {
                  setValue(e.target.value);
                  setFeedback(null);
                }}
                aria-invalid={invalid}
                aria-describedby="platform-fee-guidance"
                className="h-11 w-28"
              />
              <span className="text-muted-foreground">%</span>
            </div>
          </div>
          <Button
            className="min-h-11"
            onClick={handleSave}
            disabled={invalid || unchanged || updateFee.isPending}
          >
            {updateFee.isPending
              ? 'Updating fee…'
              : invalid || unchanged
                ? 'Update fee'
                : `Update fee to ${value}%`}
          </Button>
        </div>
        <p
          id="platform-fee-guidance"
          className={invalid ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
        >
          {invalid ? (
            `Enter a percent between ${MIN_PLATFORM_FEE_PERCENT} and ${MAX_PLATFORM_FEE_PERCENT}.`
          ) : (
            <>
              Current rate: <span className="font-medium text-foreground">{currentPercent}%</span>
            </>
          )}
        </p>
        {feedback && (
          <p
            role={feedback.tone === 'error' ? 'alert' : 'status'}
            className={
              feedback.tone === 'error' ? 'text-sm text-destructive' : 'text-sm text-success'
            }
          >
            {feedback.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function LedgerSummary({ rows }: { rows: LedgerRow[] }) {
  const { outstandingCents, paidOutCents } = summarizeLedger(rows);
  return (
    <dl className="grid overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-2">
      <div className="border-b border-border p-5 sm:border-b-0 sm:border-r">
        <dt className="text-sm text-muted-foreground">Outstanding to clubs</dt>
        <dd className="mt-1 text-xl font-semibold tabular-nums text-primary">
          {formatCents(outstandingCents)}
        </dd>
        <dd className="mt-2 text-sm text-muted-foreground">
          Online fees collected but not yet transferred.
        </dd>
      </div>
      <div className="p-5">
        <dt className="text-sm text-muted-foreground">Paid out to date</dt>
        <dd className="mt-1 text-xl font-semibold tabular-nums">{formatCents(paidOutCents)}</dd>
        <dd className="mt-2 text-sm text-muted-foreground">Completed Stripe transfers.</dd>
      </div>
    </dl>
  );
}

function LedgerError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card role="alert">
      <CardContent className="py-10 text-center">
        <p className="font-medium">Could not load the payout ledger.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Amounts are unavailable right now, not zero.
        </p>
        <Button className="mt-4 min-h-11" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}

function LedgerMobileList({ rows }: { rows: LedgerRow[] }) {
  return (
    <ul className="space-y-3 md:hidden" aria-label="Payouts by show">
      {rows.map(row => (
        <li key={row.showId}>
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{row.showName}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {row.clubName ?? 'Unknown club'}
                  </p>
                </div>
                {statusBadge(row.payoutStatus)}
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Net owed</dt>
                  <dd className="mt-1 font-medium tabular-nums">{formatCents(row.netOwedCents)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Settle date</dt>
                  <dd className="mt-1 tabular-nums">{row.settleDate ?? 'Not scheduled'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Online collected</dt>
                  <dd className="mt-1 tabular-nums">{formatCents(row.onlineCollectedCents)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Refunds</dt>
                  <dd className="mt-1 tabular-nums text-muted-foreground">
                    {formatRefundCents(row.refundedCents)}
                  </dd>
                </div>
              </dl>
              {row.stripeTransferId && (
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {row.stripeTransferId}
                </p>
              )}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
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
    <>
      <LedgerMobileList rows={rows} />
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table aria-label="Payout ledger by show">
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
    </>
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
          Resolve before payout or record the decision outside myK9.
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {unresolvedRows.map(row => (
            <Link
              key={row.showId}
              className="font-medium text-primary underline underline-offset-4"
              to={`/shows/${encodeURIComponent(row.showId)}/entry-management?tab=exceptions&exception=pulls`}
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
  const { data: rows, isLoading, isError, refetch } = usePlatformPayoutLedger();

  // Surface load failures without leaving the page blank (often RLS — only site
  // admins may read the cross-club entries/payouts this ledger joins).
  useEffect(() => {
    if (isError) toast.error('Could not load the payout ledger.');
  }, [isError]);

  return (
    <div className="container mx-auto max-w-6xl space-y-8 px-4 py-7 sm:px-6 sm:py-8">
      <header className="flex items-start gap-3">
        <Wallet aria-hidden className="mt-1 h-6 w-6 shrink-0 text-primary" />
        <div>
          <h1 className="text-[25px] font-medium tracking-[-0.018em]">Payments &amp; payouts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Platform income, fee settings, and money owed to clubs.
          </p>
        </div>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Platform income</h2>
        <PlatformIncomeCard />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Payout ledger</h2>
        {isLoading ? (
          <div className="space-y-3" role="status" aria-label="Loading payout ledger">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : isError ? (
          <LedgerError onRetry={() => void refetch()} />
        ) : (
          <>
            <LedgerSummary rows={rows ?? []} />
            <RefundDecisionAdvisory rows={rows ?? []} />
            <LedgerTable rows={rows ?? []} />
          </>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Checkout settings</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Change the fee added to new online entry checkouts.
          </p>
        </div>
        <PlatformFeeCard />
      </section>
    </div>
  );
}
