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
import { resolvePayoutStage } from '@/features/payments/payoutStage';
import { useShowPayoutSchedules } from '@/features/payments/useShowPayoutSchedules';
import { ChargeVerificationBadge } from './ChargeVerificationBadge';
import { CopyableTransferId } from './CopyableTransferId';
import { PayoutStageLine, type PayoutStageActions } from './PayoutStageLine';

const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function formatCents(cents: number): string {
  return currencyFormatter.format(cents / 100);
}

interface ClubFinancialReconciliationCardProps extends PayoutStageActions {
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
  ...stageActions
}: ClubFinancialReconciliationCardProps) {
  const { rows, isLoading, isError, refetch } = useClubFinancialReconciliation(
    clubId,
    accountState
  );
  const schedules = useShowPayoutSchedules(clubId);
  const now = new Date();

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
          Per-show net, how much of it Stripe can account for, and when each show&apos;s entry fees
          are paid to your club.
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

                  Three further constraints, each one a rewrite that was tried and
                  rejected in review. It must DENY AN INFERENCE ("this doesn't mean
                  anything is wrong") rather than ASSERT A FACT ("your payouts are
                  fine") — a failed read cannot establish that payouts are fine. It
                  must not name the failed thing more widely than it is: "your show
                  records" reads as the club's show data being at risk, when one
                  reconciliation read threw. And it must not say "money": on a money
                  screen, naming money in a failure sentence plants the alarm the
                  sentence exists to prevent. */}
              <p>
                We can&apos;t load this reconciliation right now. That&apos;s a problem displaying
                the figures, not a sign that anything happened to your payouts.
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
            {rows.map(row => {
              const stage = resolvePayoutStage({
                payout: row.settlement,
                owed: row.owed,
                accountState,
                schedule: schedules.get(row.showId) ?? null,
                now,
              });
              // A show with nothing owed has no figure "to transfer": a failed
              // row's amount is stale once the fees were refunded.
              const showTransferAmount = !!row.settlement && stage.kind !== 'nothing-to-send';
              return (
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
                  </div>
                  <PayoutStageLine stage={stage} {...stageActions} />
                  {showTransferAmount && row.settlement && (
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
                  {row.settlement?.stripeTransferId && (
                    <div className="flex flex-wrap items-center gap-1">
                      {/* No "View in Stripe" link (MYK9-1985): it opened the
                        platform's dashboard, which a club cannot sign in to.
                        The id stays copyable for a support conversation. */}
                      <CopyableTransferId transferId={row.settlement.stripeTransferId} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
