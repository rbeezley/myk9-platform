// Club financial reconciliation card (unified-financial-dashboard, MYK9-54,
// task 3.1/3.2). Enriches the EXISTING /club-admin/payments surface with
// per-show net, settlement state, charge-verification state, and a copyable
// Stripe transfer id — it does not create a new /club-admin/financial page.
//
// INTENT: a treasurer trusts this as an authoritative record they can
// explain (docs/INTENT.md, Site Admin oversight intent: "I can drill down").
// When the reconciliation RPC is unavailable, this card MUST show an
// explicit unavailable state and MUST NOT render any charge-state or
// settlement badge — a missing fact reads as missing, never as a calm green
// checkmark it cannot back up.
import { AlertCircle, ScrollText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NEUTRAL_STATUS_CHIP } from '@/components/ui/statusChip';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useClubFinancialReconciliation } from '../useClubFinancialReconciliation';
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
}

export function ClubFinancialReconciliationCard({
  clubId,
  accountState,
}: ClubFinancialReconciliationCardProps) {
  const { rows, isLoading, isError, refetch } = useClubFinancialReconciliation(clubId, accountState);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <CardTitle role="heading" aria-level={2}>
            Show reconciliation
          </CardTitle>
        </div>
        <CardDescription>
          Per-show net, which charges have a Stripe record, and transfer status for your
          club&apos;s shows.
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
          /* The default Alert is `bg-background text-foreground`, which measures
             1.07:1 light / 1.08:1 dark against the Card it sits on: the one state
             this card's INTENT header insists must read as explicitly unavailable
             rendered as ordinary body text. Amber separates it without the alarm
             of `destructive`, which would misdescribe a verification gap as a
             payout failure. */
          <Alert
            data-testid="reconciliation-unavailable"
            className="border-[color-mix(in_srgb,var(--chip-amber-fg)_40%,transparent)] bg-[color:var(--chip-amber-bg)] text-[color:var(--chip-amber-fg)]"
          >
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription className="space-y-3">
              {/* NAMES NO CAUSE (MYK9-231). This branch is React Query's verdict
                  that the query function threw; it carries no information about
                  WHERE it threw. The previous copy said we could not confirm the
                  details "against Stripe", which asserts the request reached
                  Stripe's side of the world. The #1727 outage was a detached-method
                  TypeError that threw synchronously in the browser — no request was
                  ever issued — and this sentence sent the investigation to Postgres,
                  edge and RPC-grant logs, none of which can see a client-side throw.
                  The payout reassurance stays: a failed READ must never read as a
                  failed payout. */}
              <p>
                We can&apos;t load your show records right now. This doesn&apos;t mean anything is
                wrong with your payouts — it&apos;s the lookup that&apos;s unavailable, not your
                money.
              </p>
              {/* A real control rather than a link inside the sentence: `variant="link"`
                  is `text-primary`, which measures 4.40:1 under heather+dark and
                  fails AA on the recovery affordance inside a money-load error. */}
              <Button variant="outline" size="touch" onClick={() => void refetch()}>
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
                      <Badge variant="secondary" className={NEUTRAL_STATUS_CHIP}>
                        Net pending
                        <span className="sr-only"> — awaiting Stripe processing fee capture</span>
                      </Badge>
                    )}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ChargeVerificationBadge state={row.chargeVerification} />
                  {row.settlement && (
                    <Badge
                      variant={row.settlement.state === 'attention' ? 'destructive' : 'secondary'}
                      className={
                        row.settlement.state === 'attention' ? undefined : NEUTRAL_STATUS_CHIP
                      }
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
                    <span className="font-medium tabular-nums text-foreground">
                      {formatCents(row.settlement.amountCents)}
                      {/* This qualifier was an aria-label on a bare <span>, i.e.
                          role="generic", so it was dropped -- and it is the only
                          honest qualifier on a money figure here. */}
                      {row.settlement.state !== 'settled' && (
                        <span className="sr-only"> awaiting transfer, not yet sent</span>
                      )}
                    </span>
                  </p>
                )}
                {row.settlement && (
                  /* Carried over from the "Show payouts" list this card
                     replaced. A treasurer reconciles against a bank statement,
                     and a row without a date cannot be tied to a line on it.
                     <time> so the value is machine-readable, which the old list
                     never was. */
                  <p className="text-xs text-muted-foreground">
                    {row.settlement.completedAt ? 'Paid on ' : 'Started on '}
                    <time dateTime={row.settlement.completedAt ?? row.settlement.createdAt}>
                      {new Date(
                        row.settlement.completedAt ?? row.settlement.createdAt
                      ).toLocaleDateString()}
                    </time>
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
