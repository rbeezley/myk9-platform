/**
 * PayoutLedgerPage — site-admin payout ledger + platform fee setting.
 *
 * Two financial responsibilities on one page (per the 2026-06-10 decision):
 *  - Platform fee: the one place to change the platform_settings fee columns
 *    (percent + flat per-checkout component + floor) with no deploy, read by
 *    stripe-checkout / stripe-payment-link and mirrored by the cart preview.
 *  - Payout ledger: cross-club liabilities — "whose money is in the platform's
 *    Stripe balance right now?" The operator-only complement to ClubPaymentsCard.
 *
 * Behind the SITE_ADMIN route guard; writes are also RLS + trigger gated.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Wallet, Percent, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlatformFeeRatesQuery } from '@/hooks/queries/usePlatformFeeRates';
import { formatPlatformFeeLabel, type PlatformFeeRates } from '@/store/cartStore.helpers';
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
// Mirror PLATFORM_FEE_LIMITS in supabase/functions/_shared/platformFee.ts and
// the CHECK constraints added by migration 20260823140000.
const MAX_PLATFORM_FEE_FLAT_CENTS = 500;
const MAX_PLATFORM_FEE_MIN_CENTS = 2000;

/**
 * The percent field advertises `step={0.5}` — but `step` on `<input
 * type="number">` is only a spinner hint and a native-validation rule the app
 * never reads, and `platform_fee_percent` is `numeric(5,2)` with a range-only
 * CHECK. So an operator could type and save 14.25 or 3.33 (MYK9-197 review
 * round 2, S-4).
 *
 * That matters beyond tidiness: the client and server fee expressions are
 * duplicated, and the comments in both justify keeping integer math by claiming
 * only 14.5% and 17.5% can diverge from a float rate. That claim is TRUE on the
 * 0.5 grid and FALSE on the 0.01 grid, where 432 of 2001 reachable percents
 * diverge. Enforcing the step here is what makes the claim true rather than
 * aspirational — and it narrows the input to exactly what the UI implies.
 *
 * Multiples of 0.5 are exactly representable in binary, so `× 2` is exact and
 * this cannot reject a legitimate value through float error.
 */
const PLATFORM_FEE_PERCENT_STEP = 0.5;
function isPercentOnStep(percent: number): boolean {
  return Number.isInteger(percent / PLATFORM_FEE_PERCENT_STEP);
}

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

/**
 * What the settle-date cell should read.
 *
 * Kept next to `statusBadge` because the two describe the same fact and used to
 * disagree: for an unreadable show the cell said "Not scheduled" (a claim about
 * the show's data) while the badge said the record could not be read.
 */
function settleDateLabel(row: LedgerRow): string {
  if (row.settleDate) return row.settleDate;
  return row.showUnavailable ? 'Unknown' : 'Not scheduled';
}

/**
 * Today as an ISO date.
 *
 * UTC, matching `computeSettleDate`'s UTC arithmetic and therefore the payout
 * cron — comparing like with like. The cost is that a US operator sees the
 * "Past due" badge from roughly 19:00 local the evening before, so it can fire
 * a few hours early. It cannot fire LATE, which is the direction that would
 * matter for a badge meaning "a cron did not run".
 */
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
  switch (resolveUnsettledState(row.settleDate, today, row.netOwedCents, row.showUnavailable)) {
    case 'unknown':
      return (
        <Badge variant="outline">
          Settle date unknown
          <span className="sr-only">, this show&apos;s record could not be read</span>
        </Badge>
      );
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
  // The query-state hook, NOT usePlatformFeeRates(): this card states the rates
  // as fact and gates Save on "did they change?", and both are wrong when they
  // were never read. The plain hook returns the fallback defaults while loading
  // and after a failed read, which would (a) print "Current fee: 7%" over an
  // unread row and (b) INVERT the Save gate — typing the true rate would look
  // unchanged and disable Save, while typing 7 would look like an edit.
  const { rates: currentRates, state: rateState } = usePlatformFeeRatesQuery();
  const updateFee = useUpdatePlatformFee();
  const [percentValue, setPercentValue] = useState<string>('');
  const [flatValue, setFlatValue] = useState<string>('');
  const [minValue, setMinValue] = useState<string>('');
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(
    null
  );

  // The fields are SEEDED ONCE and never re-adopt a later value.
  //
  // The previous design kept the input in sync with every refetch, and that one
  // idea produced four consecutive bugs: it clobbered in-progress edits, then
  // stranded the editor after a save, then flashed the pre-save rate over the
  // confirmation, then wedged permanently if another admin's value arrived
  // first. Each fix was a new guard on the same auto-adoption.
  //
  // All of that machinery defended against two admins editing the platform fee
  // at once — on a single-site-admin, pre-launch platform. Deleting the
  // adoption deletes the whole bug class, and costs a behaviour nobody is
  // positioned to observe.
  //
  // Divergence stays VISIBLE rather than silently resolved: the guidance line
  // below always shows the live fee straight from the query, so a fee changed
  // elsewhere appears there while the fields keep what was typed, and the Save
  // button names the fee it would actually write.
  //
  // `seeded` only ever goes false → true, so this render-phase adjustment
  // cannot oscillate.
  const [seeded, setSeeded] = useState(false);
  // Set the moment the admin types in ANY field. Distinguishes "the fields hold
  // what we seeded" from "the fields hold what a human is composing" — the only
  // reason clearing is ever unsafe.
  const [dirty, setDirty] = useState(false);

  if (!seeded && currentRates !== null) {
    setSeeded(true);
    setPercentValue(String(currentRates.percent));
    setFlatValue(String(currentRates.flatCents));
    setMinValue(String(currentRates.minCents));
  }

  // The rates stopped being readable. A bare number left in a field LABELLED
  // "Fee percent", beside a line saying the fee could not be loaded, is still
  // a claim — so it goes, unless a human typed it. An earlier revision cleared
  // unconditionally (destroying in-progress edits) and the revision after that
  // stopped clearing at all (restoring the stale claim); `dirty` is what makes
  // both properties available at once.
  if (
    currentRates === null &&
    seeded &&
    !dirty &&
    (percentValue !== '' || flatValue !== '' || minValue !== '')
  ) {
    setPercentValue('');
    setFlatValue('');
    setMinValue('');
  }

  const onEdit = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setDirty(true);
    setFeedback(null);
  };

  // No usable rates means no safe edit: an admin must never overwrite values the
  // page could not read. Every non-'ready' state disables the fields, including
  // the one where stale rates are still cached from an earlier successful read.
  const rateEditable = rateState === 'ready';

  const parsedPercent = Number(percentValue);
  const parsedFlat = Number(flatValue);
  const parsedMin = Number(minValue);
  const percentInvalid =
    percentValue.trim() === '' ||
    !Number.isFinite(parsedPercent) ||
    !isPercentOnStep(parsedPercent) ||
    parsedPercent < MIN_PLATFORM_FEE_PERCENT ||
    parsedPercent > MAX_PLATFORM_FEE_PERCENT;
  // Cents, not dollars: the columns are integer cents and the fee arithmetic is
  // integer cents, so asking for dollars here would insert a rounding step
  // between what the operator types and what the exhibitor is charged.
  const flatInvalid =
    flatValue.trim() === '' ||
    !Number.isInteger(parsedFlat) ||
    parsedFlat < 0 ||
    parsedFlat > MAX_PLATFORM_FEE_FLAT_CENTS;
  const minInvalid =
    minValue.trim() === '' ||
    !Number.isInteger(parsedMin) ||
    parsedMin < 0 ||
    parsedMin > MAX_PLATFORM_FEE_MIN_CENTS;
  const invalid = percentInvalid || flatInvalid || minInvalid;

  const nextRates: PlatformFeeRates = {
    percent: parsedPercent,
    flatCents: parsedFlat,
    minCents: parsedMin,
  };
  const unchanged =
    rateEditable &&
    currentRates !== null &&
    parsedPercent === currentRates.percent &&
    parsedFlat === currentRates.flatCents &&
    parsedMin === currentRates.minCents;

  const handleSave = () => {
    updateFee.mutate(nextRates, {
      onSuccess: saved => {
        // Show exactly what was written, and stop treating it as an unsaved
        // edit — it is now the persisted value, not something a human is still
        // composing.
        setPercentValue(String(saved.percent));
        setFlatValue(String(saved.flatCents));
        setMinValue(String(saved.minCents));
        setDirty(false);
        const message = `Platform fee updated to ${formatPlatformFeeLabel(saved)}`;
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
          The platform fee is added to every online entry checkout and shown in the cart as one
          line. It is the percent of the entry subtotal, plus a flat amount charged once per
          checkout, never less than the minimum. The flat amount mirrors Stripe&rsquo;s
          per-transaction cost, so the platform&rsquo;s take stops depending on how many entries an
          exhibitor puts in one cart; the minimum guards cheap entries. Leave the flat amount and
          the minimum at 0 to charge the percent alone. Updating takes effect immediately. No
          deployment is needed.
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
                value={percentValue}
                onChange={e => onEdit(setPercentValue)(e.target.value)}
                aria-invalid={percentInvalid}
                aria-describedby="platform-fee-guidance"
                disabled={!rateEditable}
                className="h-11 w-28"
              />
              <span className="text-muted-foreground">%</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="platform-fee-flat">Flat amount per checkout</Label>
            <div className="flex items-center gap-2">
              <Input
                id="platform-fee-flat"
                type="number"
                min={0}
                max={MAX_PLATFORM_FEE_FLAT_CENTS}
                step={1}
                value={flatValue}
                onChange={e => onEdit(setFlatValue)(e.target.value)}
                aria-invalid={flatInvalid}
                aria-describedby="platform-fee-guidance"
                disabled={!rateEditable}
                className="h-11 w-28"
              />
              <span className="text-muted-foreground">¢</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="platform-fee-min">Minimum fee</Label>
            <div className="flex items-center gap-2">
              <Input
                id="platform-fee-min"
                type="number"
                min={0}
                max={MAX_PLATFORM_FEE_MIN_CENTS}
                step={1}
                value={minValue}
                onChange={e => onEdit(setMinValue)(e.target.value)}
                aria-invalid={minInvalid}
                aria-describedby="platform-fee-guidance"
                disabled={!rateEditable}
                className="h-11 w-28"
              />
              <span className="text-muted-foreground">¢</span>
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
                : `Update fee to ${formatPlatformFeeLabel(nextRates)}`}
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
          {/* Order matters: an unread fee is reported BEFORE any judgement about
              the typed values, because "is this valid?" and "has this changed?"
              are both meaningless without a fee to compare against. */}
          {rateState === 'unavailable' ? (
            'The current fee could not be loaded, so it cannot be changed here. Reload to try again.'
          ) : rateState === 'absent' ? (
            'No platform fee is set. Contact support before charging entries.'
          ) : rateState === 'loading' ? (
            'Loading the current fee…'
          ) : percentInvalid ? (
            `Enter a percent between ${MIN_PLATFORM_FEE_PERCENT} and ${MAX_PLATFORM_FEE_PERCENT}, ` +
            `in steps of ${PLATFORM_FEE_PERCENT_STEP}.`
          ) : flatInvalid ? (
            `Enter a flat amount in whole cents between 0 and ${MAX_PLATFORM_FEE_FLAT_CENTS}.`
          ) : minInvalid ? (
            `Enter a minimum fee in whole cents between 0 and ${MAX_PLATFORM_FEE_MIN_CENTS}.`
          ) : (
            <>
              Current fee:{' '}
              <span className="font-medium text-foreground">
                {currentRates === null ? '' : formatPlatformFeeLabel(currentRates)}
              </span>
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
  const {
    outstandingCents,
    paidOutCents,
    unavailableShowCount,
    uncollectedRefundCount,
    uncollectedRefundCents,
  } = summarizeLedger(rows);
  return (
    <dl className="grid overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-2">
      <div className="border-b border-border p-5 sm:border-b-0 sm:border-r">
        {/* The page's one liability figure. A second, narrower one used to sit
            in the income card above — pending + processing + failed transfers,
            i.e. only shows that already HAVE a payout record. Two "owed"
            numbers that legitimately disagreed, ~200px apart, with nothing
            saying why. The subset was deleted rather than relabelled: this
            figure answers the page's actual question and recomputes a failed
            payout's stale amount instead of trusting it. One thing did go: the
            deleted panel showed a failed-transfer DOLLAR total, where
            Reconciliation attention only shows a count. The money is still in
            the figure below and on each failed show's own row, so nothing is
            hidden — but "counted" is not "broken out", and this comment should
            not pretend otherwise. */}
        <dt className="text-sm text-muted-foreground">Owed to clubs</dt>
        <dd className="mt-1 text-xl font-semibold tabular-nums text-primary">
          {formatCents(outstandingCents)}
        </dd>
        <dd className="mt-2 text-sm text-muted-foreground">
          Online fees collected but not yet paid out, across every show — including shows with no
          payout record yet.
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
      {uncollectedRefundCount > 0 && (
        <div className="border-t border-border p-4 sm:col-span-2">
          <p className="text-sm text-muted-foreground">
            {uncollectedRefundCount} {uncollectedRefundCount === 1 ? 'refund' : 'refunds'} totaling{' '}
            {formatCents(uncollectedRefundCents)} {uncollectedRefundCount === 1 ? 'is' : 'are'}{' '}
            recorded against {uncollectedRefundCount === 1 ? 'an entry' : 'entries'} not marked as
            paid. These amounts are excluded from Collected, Refunds, and Net owed until reconciled.
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

const LEDGER_COLUMNS = [
  ['club', 'Club'],
  ['show', 'Show'],
  ['collected', 'Online collected'],
  ['refunds', 'Refunds'],
  ['net-owed', 'Net owed'],
  ['settle-date', 'Settle date'],
  ['status', 'Status'],
] as const;

const LEDGER_GRID_COLUMNS =
  'md:grid-cols-[minmax(8rem,1.2fr)_minmax(10rem,1.5fr)_minmax(7rem,1fr)_minmax(5rem,.8fr)_minmax(7rem,1fr)_minmax(7rem,1fr)_minmax(11rem,1.5fr)]';

function ledgerValueId(showId: string, column: string): string {
  return `payout-${showId}-${column}`;
}

function LedgerCell({
  showId,
  column,
  className,
  children,
}: {
  showId: string;
  column: (typeof LEDGER_COLUMNS)[number][0];
  className?: string;
  children: ReactNode;
}) {
  const label = LEDGER_COLUMNS.find(([key]) => key === column)?.[1] ?? column;
  const valueId = ledgerValueId(showId, column);
  return (
    <div
      role="cell"
      aria-labelledby={`payout-column-${column} ${valueId}`}
      className={`min-w-0 p-3 md:px-2 md:py-3 ${className ?? ''}`}
    >
      <span aria-hidden="true" className="mb-1 block text-sm text-muted-foreground md:hidden">
        {label}
      </span>
      <span id={valueId}>{children}</span>
    </div>
  );
}

/** One responsive row; the same node is a mobile card and a desktop row. */
function PayoutLedgerRow({ row, today }: { row: LedgerRow; today: string }) {
  return (
    <div
      role="row"
      data-testid="payout-ledger-row"
      className={`grid gap-x-3 rounded-xl border bg-card shadow-sm ${LEDGER_GRID_COLUMNS} md:items-center md:gap-0 md:rounded-none md:border-0 md:border-b md:bg-transparent md:shadow-none`}
    >
      <LedgerCell showId={row.showId} column="club" className="font-medium text-foreground">
        {row.clubName ?? <span className="text-muted-foreground">Unknown club</span>}
      </LedgerCell>
      <LedgerCell showId={row.showId} column="show" className="font-medium text-foreground">
        {showLabel(row)}
      </LedgerCell>
      <LedgerCell showId={row.showId} column="collected" className="tabular-nums md:text-right">
        {formatCents(row.onlineCollectedCents)}
      </LedgerCell>
      <LedgerCell
        showId={row.showId}
        column="refunds"
        className="tabular-nums text-muted-foreground md:text-right"
      >
        {formatRefundCents(row.refundedCents)}
      </LedgerCell>
      <LedgerCell
        showId={row.showId}
        column="net-owed"
        className="font-medium tabular-nums md:text-right"
      >
        {formatCents(row.netOwedCents)}
        {row.netOwedSource === 'transfer' && (
          <span className="block text-xs font-normal text-muted-foreground">
            {row.payoutStatus === 'completed' ? 'as transferred' : 'as recorded'}
          </span>
        )}
      </LedgerCell>
      <LedgerCell showId={row.showId} column="settle-date" className="tabular-nums">
        {row.settleDate ?? <span className="text-muted-foreground">{settleDateLabel(row)}</span>}
      </LedgerCell>
      <LedgerCell showId={row.showId} column="status" className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
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
      </LedgerCell>
    </div>
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
    <Card>
      <CardContent
        className="overflow-x-auto p-0"
        role="region"
        aria-label="Payout ledger"
        tabIndex={0}
      >
        <div
          role="table"
          aria-label="Payout ledger by show"
          data-testid="payout-ledger-table"
          className="w-full min-w-0 text-sm"
        >
          <div role="rowgroup" className="border-b border-border">
            <div role="row" className={`grid ${LEDGER_GRID_COLUMNS} sr-only md:not-sr-only`}>
              {LEDGER_COLUMNS.map(([column, label]) => (
                <div
                  key={column}
                  role="columnheader"
                  id={`payout-column-${column}`}
                  className="p-3 text-left font-medium text-muted-foreground md:px-2 md:py-3"
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
          <div role="rowgroup" className="space-y-3 p-3 md:space-y-0 md:p-0">
            {rows.map(row => (
              <PayoutLedgerRow key={row.showId} row={row} today={today} />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
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
  // could not be read, every row was backfilled with null — and
  // isUnresolvedPullRefundDecision requires refund_decision === null, so the
  // count INFLATES: entries already marked 'denied' read as unresolved too.
  // Rendering that number would send the operator to entries that need nothing,
  // via links they cannot act on. The count is fiction either way; say so.
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
