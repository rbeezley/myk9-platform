// Club financial reconciliation card (unified-financial-dashboard, MYK9-54,
// task 3.1/3.2). Enriches the EXISTING /club-admin/payments surface with
// per-show net, settlement state, charge-verification state, and a copyable
// Stripe transfer id — it does not create a new /club-admin/financial page.
//
// INTENT: a treasurer trusts this as an authoritative record they can
// explain (docs/INTENT.md, Site Admin oversight intent: "I can drill down").
// When the reconciliation RPC is unavailable, this card MUST show an
// explicit unavailable state and MUST NOT render any Verified/Attested/
// settlement badge — a missing fact reads as missing, never as a calm green
// checkmark it cannot back up.
import { AlertCircle, ScrollText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useClubFinancialReconciliation } from '../useClubFinancialReconciliation';
import type { ShowPayoutRow } from '@/features/payments/useClubStripeAccount';
import type { PayoutsAccountState } from '@/features/payments/payoutBadge';
import { ChargeVerificationBadge } from './ChargeVerificationBadge';
import { CopyableTransferId } from './CopyableTransferId';
import { StripeLinkOut } from './StripeLinkOut';

const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function formatCents(cents: number): string {
  return currencyFormatter.format(cents / 100);
}

interface ClubFinancialReconciliationCardProps {
  clubId: string;
  /**
   * Tri-state, never a boolean: while the Stripe account row is loading or has
   * failed to load we know nothing about payouts, and this card renders OUTSIDE
   * the account card's loading/error guard. Collapsing that to `false` labelled
   * every pending payout "Waiting for account" against data never read.
   */
  accountState: PayoutsAccountState;
  payoutHistory: ShowPayoutRow[] | undefined;
}

export function ClubFinancialReconciliationCard({
  clubId,
  accountState,
  payoutHistory,
}: ClubFinancialReconciliationCardProps) {
  const { rows, isLoading, isError, refetch } = useClubFinancialReconciliation(
    clubId,
    accountState,
    payoutHistory
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <CardTitle>Show reconciliation</CardTitle>
        </div>
        <CardDescription>
          Per-show net, Stripe verification, and transfer status for your club&apos;s shows.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}

        {!isLoading && isError && (
          <Alert data-testid="reconciliation-unavailable">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>
              Stripe verification is unavailable right now. This doesn&apos;t mean anything is wrong
              with your payouts — we just can&apos;t confirm the details against Stripe at the
              moment.{' '}
              <Button
                variant="link"
                className="inline-flex min-h-[44px] items-center p-0"
                onClick={() => refetch()}
              >
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {!isLoading && !isError && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No shows to reconcile yet. This fills in once your club&apos;s first show collects entry
            fees.
          </p>
        )}

        {!isLoading && !isError && rows.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {rows.map(row => (
              <li key={row.showId} className="space-y-2 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{row.showName}</p>
                  <span className="text-sm font-semibold tabular-nums">
                    {row.net.status === 'available' ? (
                      formatCents(row.net.netCents)
                    ) : (
                      <Badge
                        variant="secondary"
                        aria-label="Net amount pending Stripe processing fee capture"
                      >
                        Net pending
                      </Badge>
                    )}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ChargeVerificationBadge state={row.chargeVerification} />
                  {row.settlement && (
                    <Badge
                      variant={row.settlement.state === 'attention' ? 'destructive' : 'secondary'}
                      aria-label={`Payout settlement: ${row.settlement.badgeLabel}`}
                    >
                      {row.settlement.badgeLabel}
                    </Badge>
                  )}
                </div>
                {row.settlement && (
                  // The transfer amount, distinct from the entry-fee `net` above.
                  // Showing both, with the copyable transfer id, is the
                  // reconciliation view: the treasurer ties this figure to what
                  // Stripe reports for tr_….
                  //
                  // INTENT: the wording must never claim money moved that has not.
                  // A pending/processing/failed payout still HAS an amount, but it
                  // is scheduled or owed — not transferred. Only a settled payout
                  // ('Paid') may be labelled "Transferred" (Codex round-6 finding).
                  <p className="text-xs text-muted-foreground">
                    {row.settlement.state === 'settled' ? 'Transferred: ' : 'To transfer: '}
                    <span
                      className="font-medium tabular-nums text-foreground"
                      aria-label={
                        row.settlement.state === 'settled'
                          ? `Settled transfer amount ${formatCents(row.settlement.amountCents)}`
                          : `Amount awaiting transfer ${formatCents(row.settlement.amountCents)}, not yet sent`
                      }
                    >
                      {formatCents(row.settlement.amountCents)}
                    </span>
                  </p>
                )}
                {row.settlement?.stripeTransferId && (
                  <div className="flex flex-wrap items-center gap-1">
                    <CopyableTransferId transferId={row.settlement.stripeTransferId} />
                    <StripeLinkOut transferId={row.settlement.stripeTransferId} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
