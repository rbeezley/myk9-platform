/**
 * AmountDueSection — what the exhibitor owes right now, and the one action
 * that clears it.
 *
 * Extracted from ExhibitorPaymentsPage to keep that file under the project's
 * 500-line limit; My Payments is its only consumer. The four branches are the
 * whole point of this component: loading, failed, *unknown*, and known. See
 * the comment on the unknown branch — collapsing it into "paid up" is the bug
 * this split makes harder to reintroduce.
 */

import { Link } from 'react-router-dom';
import { CreditCard, WalletCards } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { EntryBalanceSummary } from '@/features/payments/entryBalanceSummary';
import { formatPaymentCents } from '@/features/payments/moneyPresentation';
import { formatShowWithEntryCloseDeadline } from '@/features/payments/entryCloseDeadline';
import { useNow } from '@/hooks/useNow';

export function AmountDueSection({
  summary,
  isLoading,
  isError,
}: {
  summary: EntryBalanceSummary | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  // One clock for the whole card, above every early return so the hook order
  // is stable. A deadline lapses at midnight in the SHOW's timezone, and this
  // page's queries never refetch on window focus (`refetchOnWindowFocus` is
  // false globally), so a `now` frozen at mount would leave a tab opened the
  // night before still promising a deadline that has since passed. A 15-minute
  // tick bounds that lag in every IANA zone, including the :30/:45-offset ones
  // whose midnight does not land on an hour boundary.
  const nowMs = useNow(15 * 60 * 1000);

  if (isLoading) {
    return (
      <Card>
        <CardContent
          role="status"
          aria-label="Loading your current balance"
          className="space-y-3 py-5"
        >
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

  // "We don't know yet" is its own state and must never be drawn as "$0.00,
  // paid up". useMyEntryBalanceSummary is gated on `enabled: user?.id &&
  // personId`, and a *disabled* React Query reports isLoading:false,
  // isError:false, data:undefined — settled-looking, but never asked. Folding
  // that into the paid-up branch told an exhibitor who owed money that they
  // owed nothing: a flicker on a warm load, and permanent on a cold offline
  // boot where the person record never resolves (the MYK9-200 pattern).
  if (!summary) {
    return (
      <Card>
        <CardContent className="py-5">
          <h2 className="text-sm font-medium text-muted-foreground">Amount due</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            We can&apos;t show your balance right now. Check Current Fees on My Shows for what you
            owe.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (summary.amountDueCents <= 0) {
    return (
      <Card className="border-success/30">
        <CardContent className="flex flex-col gap-2 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-medium text-muted-foreground">Amount due</h2>
            <p className="text-2xl font-semibold tabular-nums text-success">$0.00</p>
          </div>
          <p className="text-sm text-muted-foreground">Current entries are paid up.</p>
        </CardContent>
      </Card>
    );
  }

  // Shared by every row so the multi-show breakdown can never disagree with
  // the single-show line about what day it is.
  const now = new Date(nowMs);
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
            <h2 className="text-sm font-medium text-muted-foreground">Amount due</h2>
            <p className="text-3xl font-semibold tabular-nums text-warning">
              {formatPaymentCents(summary.amountDueCents, 'usd')}
            </p>
            {/* Name the show in the single-show case too: the name used to
                appear only in the multi-show breakdown, so the common case
                showed a total and a button with nothing saying what the money
                was for.

                The qualifier matters. The figure above is the AGGREGATE due,
                which can include pay-at-show or unresolved balances belonging
                to other shows. An unqualified name sitting directly under it
                would attribute the whole total to this one show, so name it
                bare only when this show's online balance IS the whole total,
                and otherwise say which part of it this show accounts for.

                The name now carries the show's entry-close day ("Spring Trial
                - pay by Sep 14") so the card answers "by when" as well as
                "how much". A show with no close date, or one whose close day
                has passed, renders the bare name — see
                `formatEntryCloseDeadline` for why a past deadline is silence
                rather than a warning. */}
            {singleOnlineShowBalance &&
              (singleOnlineCoversFullDue ? (
                <p className="mt-1 text-sm font-medium">
                  {formatShowWithEntryCloseDeadline(
                    singleOnlineShowBalance.showName,
                    singleOnlineShowBalance.entryCloseDay,
                    now,
                    singleOnlineShowBalance.showTimezone
                  )}
                </p>
              ) : (
                /* Built as one string rather than interpolated JSX so the
                   sentence is a single text node — a screen reader reads it as
                   one phrase instead of three fragments. */
                <p className="mt-1 text-sm font-medium">
                  {`${formatPaymentCents(singleOnlineShowBalance.onlineDueCents, 'usd')} of this is for ${formatShowWithEntryCloseDeadline(
                    singleOnlineShowBalance.showName,
                    singleOnlineShowBalance.entryCloseDay,
                    now,
                    singleOnlineShowBalance.showTimezone
                  )}`}
                </p>
              ))}
            <p className="mt-1 text-sm text-muted-foreground">
              This matches Current Fees on My Shows for current entries.
            </p>
          </div>
          {singleOnlineShowBalance && singleOnlineButtonLabel && (
            <Button asChild className="min-h-11 shrink-0">
              <Link to={singleOnlineShowBalance.paymentHref}>
                <CreditCard className="h-4 w-4" aria-hidden="true" />
                {singleOnlineButtonLabel}
              </Link>
            </Button>
          )}
        </div>

        {/* A positive balance with no online breakdown and nothing marked pay
            at show would otherwise render a number and no way to act on it.
            Reachable when an entry carries a fee but no resolvable show id. */}
        {summary.onlineShowBalances.length === 0 && summary.payAtShowDueCents === 0 && (
          <p className="text-sm text-muted-foreground">
            Open{' '}
            <Link to="/exhibitor/entries" className="text-primary hover:underline">
              My Shows
            </Link>{' '}
            to pay for these entries.
          </p>
        )}

        {summary.onlineShowBalances.length > 1 && (
          <div className="space-y-2">
            {summary.onlineShowBalances.map(show => (
              <div
                key={show.showId}
                className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm font-medium">
                  {formatShowWithEntryCloseDeadline(
                    show.showName,
                    show.entryCloseDay,
                    now,
                    show.showTimezone
                  )}
                </span>
                <Button asChild variant="outline" size="touch">
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
