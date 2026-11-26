// Club financial reconciliation card (unified-financial-dashboard, MYK9-54,
// task 3.1/3.2). Enriches the EXISTING /club-admin/payments surface with
// per-show money, the payout sentence, charge-verification state, and a copyable
// Stripe transfer id — it does not create a new /club-admin/financial page.
//
// ONE SOURCE FOR MONEY (MYK9-1985, owner decision A on MYK9-2454): each row's
// Collected, Refunded and Paid, and whether anything is still owed, come only
// from club_show_payout_figures (useClubShowPayoutFigures), which computes them
// the way the payout run does. The reconciliation read supplies only what is not
// money: the charge-coverage badge and the transfer id. Three review rounds found
// a new stale figure each time the card mixed a stored payout amount, the order
// net and $0 rows; do not add a second money source back.
//
// THE SHOW LIST IS THE UNION of both reads (MYK9-1985, Codex round 4): a show
// with a real Stripe charge but no figures row still gets its row, with its name
// and charge badge and no money at all, never a figure derived from its orders.
// And only a SUCCESSFUL read counts: an offline first read is paused, neither
// loading nor in error, with no data, so "No shows" or "No Stripe charges" drawn
// from it states an absence nobody read. Anything short of both reads succeeding
// is the unavailable state below.
//
// INTENT: a treasurer trusts this as an authoritative record they can
// explain (docs/INTENT.md, Site Admin oversight intent: "I can drill down").
// When the reconciliation RPC is unavailable, this card MUST show an
// explicit unavailable state and MUST NOT render any charge-state or
// settlement badge — a missing fact reads as missing, never as a calm green
// checkmark it cannot back up.
import { AlertCircle, ScrollText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useClubFinancialReconciliation } from '../useClubFinancialReconciliation';
import type { ClubShowPayoutFigures } from '@/features/payments/clubShowPayoutFigures';
import type { ClubShowReconciliationRow } from '../clubShowReconciliation';
import type { PayoutsAccountState } from '@/features/payments/payoutBadge';
import { resolvePayoutStage } from '@/features/payments/payoutStage';
import { useClubShowPayoutFigures } from '@/features/payments/useClubShowPayoutFigures';
import {
  useShowPayoutSchedules,
  type ShowPayoutSchedule,
} from '@/features/payments/useShowPayoutSchedules';
import { ChargeVerificationBadge } from './ChargeVerificationBadge';
import { CopyableTransferId } from './CopyableTransferId';
import { PayoutStageLine } from './PayoutStageLine';

const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function formatCents(cents: number): string {
  return currencyFormatter.format(cents / 100);
}

/**
 * The third figure: what reached, is reaching, or is still to reach the club.
 *
 * INTENT: the wording must never claim money moved that has not. Only a sent
 * payout (a completed one above $0) reads "Paid"; a transfer Stripe holds reads
 * "Being sent"; anything still owed reads "To transfer" at the live owed figure,
 * never a parked row's stored amount. Nothing owed and nothing sent shows no
 * third figure, so a fully refunded show never reads "Paid $0.00".
 */
function thirdFigure(
  figures: ClubShowPayoutFigures
): { label: string; cents: number; unsent: boolean } | null {
  if (figures.paid.kind === 'sent') {
    return { label: 'Paid', cents: figures.paid.cents, unsent: false };
  }
  if (figures.paid.kind === 'in-flight') {
    return { label: 'Being sent', cents: figures.paid.cents, unsent: false };
  }
  if (figures.owedCents > 0) {
    return { label: 'To transfer', cents: figures.owedCents, unsent: true };
  }
  return null;
}

function Amount({ cents, unsent = false }: { cents: number; unsent?: boolean }) {
  return (
    <span className="font-medium tabular-nums text-foreground">
      {formatCents(cents)}
      {/* The only honest qualifier on an unsent figure, in text: an aria-label on
          a bare <span> (role="generic") is dropped by the accessibility tree. */}
      {unsent && <span className="sr-only"> awaiting transfer, not yet sent</span>}
    </span>
  );
}

/** "Collected $1,280.00 · Refunded $32.00 · Paid $1,248.00", as the server computed them. */
function PayoutFiguresLine({ figures }: { figures: ClubShowPayoutFigures }) {
  const third = thirdFigure(figures);
  return (
    <p className="text-sm text-muted-foreground" data-testid="payout-figures">
      Collected <Amount cents={figures.collectedCents} />
      {' · '}Refunded <Amount cents={figures.refundedCents} />
      {third && (
        <>
          {' · '}
          {third.label} <Amount cents={third.cents} unsent={third.unsent} />
        </>
      )}
    </p>
  );
}

/** One show on the card: in the figures read, the reconciliation read, or both. */
interface CardShow {
  showId: string;
  figures: ClubShowPayoutFigures | null;
  reconciled: ClubShowReconciliationRow | null;
}

/** Every show either read returned, in the figures read's order, then the charge-only ones. */
function unionOfShows(
  figuresRows: ClubShowPayoutFigures[],
  reconciledRows: ClubShowReconciliationRow[]
): CardShow[] {
  const reconciledByShow = new Map(reconciledRows.map(row => [row.showId, row]));
  const shows: CardShow[] = figuresRows.map(figures => ({
    showId: figures.showId,
    figures,
    reconciled: reconciledByShow.get(figures.showId) ?? null,
  }));
  const listed = new Set(figuresRows.map(figures => figures.showId));
  for (const reconciled of reconciledRows) {
    if (!listed.has(reconciled.showId)) {
      shows.push({ showId: reconciled.showId, figures: null, reconciled });
    }
  }
  return shows;
}

function ShowRow({
  show,
  accountState,
  schedule,
  now,
}: {
  show: CardShow;
  accountState: PayoutsAccountState;
  schedule: ShowPayoutSchedule | null;
  now: Date;
}) {
  const { figures, reconciled } = show;
  // The transfer id belongs to one payout row: shown only when it is the same
  // row the figures describe.
  const transferId =
    figures && reconciled?.settlement && reconciled.settlement.payoutId === figures.payout?.id
      ? reconciled.settlement.stripeTransferId
      : null;
  return (
    <li className="space-y-2 px-3 py-3">
      <p className="truncate text-sm font-medium">
        {figures?.showName ?? reconciled?.showName ?? 'Show'}
      </p>
      {figures ? (
        <PayoutFiguresLine figures={figures} />
      ) : (
        /* A charge with no figures row: the server has not answered for this
           show's money, so the row states none and claims no payout date. */
        <p className="text-sm text-muted-foreground">Payout figures not available yet.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {/* Both reads succeeded, so a show the reconciliation read has no row
            for is literally no stripe_orders rows for the show. */}
        <ChargeVerificationBadge state={reconciled?.chargeVerification ?? 'NoStripeCharges'} />
      </div>
      {figures && (
        <PayoutStageLine stage={resolvePayoutStage({ figures, accountState, schedule, now })} />
      )}
      {transferId && (
        <div className="flex flex-wrap items-center gap-1">
          {/* No "View in Stripe" link (MYK9-1985): it opened the platform's
              dashboard, which a club cannot sign in to. The id stays copyable
              for a support conversation. */}
          <CopyableTransferId transferId={transferId} />
        </div>
      )}
    </li>
  );
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
  const figuresQuery = useClubShowPayoutFigures(clubId);
  const reconciliation = useClubFinancialReconciliation(clubId, accountState);
  const schedules = useShowPayoutSchedules(clubId);
  const now = new Date();

  // One state for the card: a figure the server has not answered for is never
  // rendered as $0 or "nothing owed". Either read still loading is the skeleton;
  // anything else short of both reads succeeding (failed, or paused offline) is
  // the unavailable state below.
  const isLoading = figuresQuery.isLoading || reconciliation.isLoading;
  const isAnswered = figuresQuery.isSuccess && reconciliation.isSuccess && !!figuresQuery.data;
  const shows = isAnswered ? unionOfShows(figuresQuery.data ?? [], reconciliation.rows) : [];
  const refetch = () => {
    void figuresQuery.refetch();
    reconciliation.refetch();
  };

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
          What each show collected, refunded and paid, how much of it Stripe can account for, and
          when each show&apos;s entry fees are paid to your club.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}

        {!isLoading && !isAnswered && (
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

        {!isLoading && isAnswered && shows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No shows to reconcile yet. This fills in once your club&apos;s first show collects entry
            fees.
          </p>
        )}

        {!isLoading && isAnswered && shows.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {shows.map(show => (
              <ShowRow
                key={show.showId}
                show={show}
                accountState={accountState}
                schedule={schedules.get(show.showId) ?? null}
                now={now}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
