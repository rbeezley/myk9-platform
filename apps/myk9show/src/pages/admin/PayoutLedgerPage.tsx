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
import { usePlatformFeePercentQuery } from '@/hooks/queries/usePlatformFeePercent';
import { useUpdatePlatformFee } from '@/features/payments/useUpdatePlatformFee';
import { usePlatformPayoutLedger } from '@/features/payments/usePlatformPayoutLedger';
import {
  resolveUnsettledState,
  summarizeLedger,
  type LedgerRow,
} from '@/features/payments/payoutLedger';
import { PlatformIncomeCard } from '@/features/financial/components/PlatformIncomeCard';
import { getPayoutStatusPresentation } from './adminStatusPresentation';

/* Warning tone for a payout past its settle date. Uses the shared admin status
   classes rather than a one-off so it stays consistent with the other badges,
   and because `border-warning/*` / `bg-warning/*` DO compile — those tokens
   carry <alpha-value>, unlike the plain var() tokens (see index.css:265). */
const OVERDUE_STATUS_CLASS = 'border-warning/30 bg-warning/10 text-warning hover:bg-warning/10';

const MIN_PLATFORM_FEE_PERCENT = 0;
const MAX_PLATFORM_FEE_PERCENT = 20;

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** A refund reduces what the club is owed, so show it as a signed deduction. */
function formatRefundCents(cents: number): string {
  return cents > 0 ? `-${formatCents(cents)}` : formatCents(0);
}

/**
 * What to call a show whose record we could not read (MYK9-233).
 *
 * Deliberately names the gap instead of falling back to "Unknown show": the
 * operator needs to know the row is a READ FAILURE they can act on, not a show
 * that happens to be missing a name. The id is shown because it is the only
 * handle they have for chasing it.
 */
function showLabel(row: LedgerRow): string {
  return row.showName ?? `Show unavailable (${row.showId.slice(0, 8)})`;
}

/** Today as an ISO date, for comparing against a settle date. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * A show with no payout row is not one situation but three, and the single
 * "Not settled" badge hid the only one that needs the operator: money whose
 * settle date has passed with no transfer ever created. That is a cron that did
 * not run, and it looked exactly like a show settling next month.
 */
function statusBadge(row: LedgerRow, today: string) {
  if (row.payoutStatus) {
    const presentation = getPayoutStatusPresentation(row.payoutStatus);
    return <Badge className={presentation.className}>{presentation.label}</Badge>;
  }
  switch (resolveUnsettledState(row.settleDate, today, row.netOwedCents)) {
    case 'nothing-owed':
      return <Badge variant="outline">Nothing owed</Badge>;
    case 'overdue':
      return (
        <Badge className={OVERDUE_STATUS_CLASS}>
          Past due
          <span className="sr-only">, settle date passed with no transfer created</span>
        </Badge>
      );
    case 'scheduled':
      return <Badge variant="outline">Scheduled</Badge>;
    default:
      return (
        <Badge variant="outline">
          Not scheduled
          <span className="sr-only">, the show has no end date</span>
        </Badge>
      );
  }
}

function PlatformFeeCard() {
  // The query-state hook, NOT usePlatformFeePercent(): this card states the rate
  // as fact and gates Save on "did it change?", and both are wrong when the rate
  // was never read. The plain hook returns the constant 7 while loading and after
  // a failed read, which would (a) print "Current rate: 7%" over an unread row
  // and (b) INVERT the Save gate — typing the true rate would look unchanged and
  // disable Save, while typing 7 would look like an edit.
  const { percent: currentPercent, state: rateState } = usePlatformFeePercentQuery();
  const updateFee = useUpdatePlatformFee();
  const [value, setValue] = useState<string>('');
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(
    null
  );

  // Resync the field when the fetched rate changes (initial load / refetch),
  // following the adjust-state-during-render pattern (no setState in effect).
  //
  // The null branch is not symmetry for its own sake: without it, a successful
  // load followed by a failed or paused refetch leaves the OLD rate sitting in
  // the (now disabled) field. The hook would have correctly stopped returning
  // that number, and the card would still be showing it — which is the same
  // stale-rate claim, relocated from a paragraph into an input.
  const [syncedFrom, setSyncedFrom] = useState<number | null>(null);
  // The rate this admin just saved, held until the query reports it back.
  const [awaitingSave, setAwaitingSave] = useState<number | null>(null);

  // Whether an incoming rate may overwrite the field. Written as one explicit
  // decision rather than a chain of guards, because each of the three reasons
  // below was added in response to a separate bug and reading them as a
  // sequence is how the last one got introduced.
  //
  //   awaitingSave  a save succeeded and the query has not caught up. The cache
  //                 still holds the PRE-save rate, so adopting it would flip the
  //                 field back to 7 while the toast says 9.
  //   dirty field   the admin is mid-edit. refetchOnWindowFocus is on, so
  //                 tabbing to Stripe and back would otherwise discard the edit.
  //                 (This is also where Codex's "disable the editor while
  //                 fetching" suggestion was heading — that clears the field on
  //                 every refocus, which is this same bug via another route.)
  //   unchanged     nothing to do.
  const fieldIsClean = value === (syncedFrom === null ? '' : String(syncedFrom));
  if (awaitingSave !== null) {
    // Only the saved value ends the wait; anything else is the stale cache.
    if (currentPercent === awaitingSave) setAwaitingSave(null);
  } else if (syncedFrom !== currentPercent && fieldIsClean) {
    setSyncedFrom(currentPercent);
    setValue(currentPercent === null ? '' : String(currentPercent));
  }

  // No usable rate means no safe edit: an admin must never overwrite a value the
  // page could not read. Every non-'ready' state disables the field, including
  // the one where a stale rate is still cached from an earlier successful read.
  const rateEditable = rateState === 'ready';
  const parsed = Number(value);
  const invalid =
    value.trim() === '' ||
    !Number.isFinite(parsed) ||
    parsed < MIN_PLATFORM_FEE_PERCENT ||
    parsed > MAX_PLATFORM_FEE_PERCENT;
  const unchanged = rateEditable && parsed === currentPercent;

  const handleSave = () => {
    updateFee.mutate(parsed, {
      onSuccess: p => {
        // Move the baseline to what was just saved, so the field stops reading
        // as dirty and future refetches are adopted again. `awaitingSave` holds
        // off that adoption until the query actually reports p back — the cache
        // still contains the pre-save rate at this moment.
        setSyncedFrom(p);
        setValue(String(p));
        setAwaitingSave(p);
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
                disabled={!rateEditable}
                className="h-11 w-28"
              />
              <span className="text-muted-foreground">%</span>
            </div>
          </div>
          <Button
            className="min-h-11"
            onClick={handleSave}
            disabled={!rateEditable || invalid || unchanged || updateFee.isPending}
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
          className={
            rateState === 'unavailable' || rateState === 'absent' || (rateEditable && invalid)
              ? 'text-sm text-destructive'
              : 'text-sm text-muted-foreground'
          }
        >
          {/* Order matters: an unread rate is reported BEFORE any judgement about
              the typed value, because "is this valid?" and "has this changed?"
              are both meaningless without a rate to compare against. */}
          {rateState === 'unavailable' ? (
            'The current rate could not be loaded, so it cannot be changed here. Reload to try again.'
          ) : rateState === 'absent' ? (
            'No platform fee rate is set. Contact support before charging entries.'
          ) : rateState === 'loading' ? (
            'Loading the current rate…'
          ) : invalid ? (
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
  const { outstandingCents, paidOutCents, unavailableShowCount } = summarizeLedger(rows);
  return (
    <dl className="grid overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-2">
      <div className="border-b border-border p-5 sm:border-b-0 sm:border-r">
        <dt className="text-sm text-muted-foreground">Owed to clubs (all shows)</dt>
        <dd className="mt-1 text-xl font-semibold tabular-nums text-primary">
          {formatCents(outstandingCents)}
        </dd>
        <dd className="mt-2 text-sm text-muted-foreground">
          Online fees collected but not yet transferred — including shows with no transfer created
          yet. Larger than &ldquo;In flight to Stripe&rdquo; above by exactly that amount.
        </dd>
      </div>
      <div className="p-5">
        <dt className="text-sm text-muted-foreground">Paid out to date</dt>
        <dd className="mt-1 text-xl font-semibold tabular-nums">{formatCents(paidOutCents)}</dd>
        <dd className="mt-2 text-sm text-muted-foreground">Completed Stripe transfers.</dd>
      </div>
      {unavailableShowCount > 0 && (
        /* The cents ARE in the totals above; what is missing is the identity of
           the show they belong to. Say exactly that — an operator who sees an
           unnamed row must know the figure is complete, not that money is lost. */
        <div className="border-t border-border p-4 sm:col-span-2">
          <p className="text-sm text-muted-foreground">
            {unavailableShowCount === 1
              ? '1 show below could not be identified. Its money is included in the totals above.'
              : `${unavailableShowCount} shows below could not be identified. Their money is included in the totals above.`}
          </p>
        </div>
      )}
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
        {/* NOT variant="outline": buttonVariants gives outline
            `bg-secondary text-secondary-foreground`, and in `.dark`
            --secondary (#1e1c19) is byte-identical to --card (#1e1c19), so the
            control measures 1.00:1 against the card it sits on — invisible, on
            the one affordance that only appears when the money failed to load.
            The default filled variant clears 3:1 in both themes. */}
        <Button className="mt-4 min-h-11" onClick={onRetry}>
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}

function LedgerMobileList({ rows, today }: { rows: LedgerRow[]; today: string }) {
  return (
    <ul className="space-y-3 md:hidden" aria-label="Payouts by show">
      {rows.map(row => (
        <li key={row.showId}>
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{showLabel(row)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {row.clubName ?? 'Unknown club'}
                  </p>
                </div>
                {statusBadge(row, today)}
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Net owed</dt>
                  <dd className="mt-1 font-medium tabular-nums">
                    {formatCents(row.netOwedCents)}
                    {row.netOwedSource === 'transfer' && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        as transferred
                      </span>
                    )}
                  </dd>
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

function LedgerTable({ rows, today }: { rows: LedgerRow[]; today: string }) {
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
      <LedgerMobileList rows={rows} today={today} />
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table aria-label="Payout ledger by show" scrollAreaLabel="Payout ledger">
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
                  <TableCell>{showLabel(row)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(row.onlineCollectedCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatRefundCents(row.refundedCents)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCents(row.netOwedCents)}
                    {row.netOwedSource === 'transfer' && (
                      /* Not Collected − Refunds. This is the amount the cron
                         wrote onto the payout row, frozen at that moment, so a
                         later refund leaves the three columns not adding up.
                         Say so rather than let the operator find it as an
                         arithmetic error in their own reconciliation. */
                      <span className="block text-xs font-normal text-muted-foreground">
                        as transferred
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {row.settleDate ?? <span className="text-muted-foreground">Not scheduled</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {statusBadge(row, today)}
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

function RefundDecisionAdvisory({
  rows,
  refundDecisionChecked,
}: {
  rows: LedgerRow[];
  refundDecisionChecked: boolean;
}) {
  // A degraded read must not look like a clean one. When the pull-refund column
  // could not be read, every row was backfilled with null, so the unresolved
  // count is 0 for reasons that have nothing to do with the data. Rendering
  // nothing here would be an absent warning that reads as "all resolved".
  if (!refundDecisionChecked) {
    return (
      <Alert className="border-warning/30 bg-warning/10">
        <AlertTriangle className="h-4 w-4 !text-warning" aria-hidden="true" />
        <AlertDescription>
          Pull-refund decisions could not be checked, so this page cannot tell you whether any are
          outstanding. Amounts elsewhere on the page are unaffected.
        </AlertDescription>
      </Alert>
    );
  }

  const unresolvedRows = rows.filter(row => row.unresolvedRefundDecisionCount > 0);
  if (unresolvedRows.length === 0) return null;

  const total = unresolvedRows.reduce((sum, row) => sum + row.unresolvedRefundDecisionCount, 0);

  return (
    <Alert className="border-warning/30 bg-warning/10">
      <AlertTriangle className="h-4 w-4 !text-warning" aria-hidden="true" />
      <AlertDescription className="space-y-2">
        <p>
          {total} pulled {total === 1 ? 'entry' : 'entries'} with unresolved refund decisions.
          Resolve before payout or record the decision outside myK9.
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {unresolvedRows.map(row =>
            row.showUnavailable ? (
              /* No link for a show we could not read. Entry Management resolves
                 the URL's show through the same reads that failed here, so the
                 page would load with nothing selected — an affordance that
                 cannot work is worse than none, because the operator spends the
                 trip before learning that. */
              <span key={row.showId} className="font-medium">
                {showLabel(row)} ({row.unresolvedRefundDecisionCount})
                <span className="text-muted-foreground"> — show record unavailable</span>
              </span>
            ) : (
              <Link
                key={row.showId}
                className="font-medium text-primary underline underline-offset-4"
                to={`/shows/${encodeURIComponent(row.showId)}/entry-management?tab=exceptions&exception=pulls`}
                aria-label={`Review pulled entries for ${showLabel(row)}`}
              >
                {showLabel(row)} ({row.unresolvedRefundDecisionCount})
              </Link>
            )
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

export default function PayoutLedgerPage() {
  const { data: ledger, isLoading, isError, refetch } = usePlatformPayoutLedger();
  const rows = ledger?.rows;

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
        ) : isError || !rows ? (
          /* `!rows` is NOT redundant with isError. networkMode:'online'
             (queryClient.ts:61) PAUSES a query with no connectivity, and a paused
             query is neither loading nor errored — react-query computes
             `isLoading = isPending && isFetching`, and a paused query is not
             fetching. So a cold offline load arrives here as
             isLoading:false / isError:false / data:undefined, and `rows ?? []`
             would render "Outstanding to clubs $0.00" and "No online payments
             yet": the platform owes nothing, stated as fact, because we never
             asked. PlatformIncomeCard above already guards `isError || !data`. */
          <LedgerError onRetry={() => void refetch()} />
        ) : (
          <>
            <LedgerSummary rows={rows} />
            <RefundDecisionAdvisory
              rows={rows}
              refundDecisionChecked={ledger.refundDecisionChecked}
            />
            <LedgerTable rows={rows} today={todayIso()} />
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
