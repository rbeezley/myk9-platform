/**
 * CompactStatsRow — the exhibitor's entry-fee balance.
 *
 * This was a four-across grid of stat cards (Current entries · Upcoming shows ·
 * Completed shows · Current fees). Three of them are gone, and their deletion
 * is the point:
 *
 *  - Upcoming and Completed deep-linked to the Upcoming and Completed filters
 *    rendered about 200px below them. A second control for a control already on
 *    screen. (#1696 had already repaired these from no-ops that navigated to
 *    the page you were on; this is the step that run did not take.)
 *  - "Completed Shows" counted distinct SHOWS while the filter beside it counts
 *    entries, so "4" sat above "190" describing the same word in different
 *    units with nothing saying so. Deleting it removes "shows" as a unit this
 *    page counts at all.
 *  - "Current entries" restated the status chips at a DIFFERENT scope, which
 *    invited a comparison that was never valid.
 *  - Four identical cards in a row is the hero-metric template DESIGN.md bans
 *    by name.
 *
 * What remains is the one fact that is not already on the page and that the
 * exhibitor can act on: money owed, and the way to pay it.
 *
 * INTENT: the fee balance is always visible and never collapsed behind a
 * disclosure. The previous mobile behaviour hid a four-card grid behind a
 * summary line that re-surfaced this balance, because the grid was too tall for
 * a phone — with one strip there is nothing to hide, so the balance is simply
 * present at every width. Do not reintroduce a collapse here: the whole reason
 * the old summary line existed was to keep THIS number reachable.
 */

import { cn, formatCurrency } from '@/lib/utils';
import { CircleCheckBig, CreditCard } from 'lucide-react';

interface CompactStatsRowProps {
  /** Total fees across the exhibitor's current entries. */
  currentFees: number;
  /** Amount still owed. `<= 0` is the paid-in-full state. */
  amountDue: number;
  /** Cart/payment target for the owed balance; falls back to the cart. */
  currentFeesHref?: string;
  onNavigate: (path: string) => void;
  className?: string | undefined;
}

export function CompactStatsRow({
  currentFees,
  amountDue,
  currentFeesHref,
  onNavigate,
  className,
}: CompactStatsRowProps) {
  const paidInFull = amountDue <= 0;
  const feeHref = paidInFull ? '/exhibitor/payments' : (currentFeesHref ?? '/cart');

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => onNavigate(feeHref)}
        aria-label={
          paidInFull
            ? 'Entry fees: paid in full. View your payments.'
            : `Entry fees: ${formatCurrency(amountDue)} due of ${formatCurrency(currentFees)}. Finish payment.`
        }
        className={cn(
          'group flex w-full flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 text-left shadow-sm',
          'hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-enter',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span
            data-slot="icon"
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg border shadow-sm',
              paidInFull
                ? 'border-success/25 bg-success/10 text-success'
                : 'border-warning/30 bg-warning/10 text-warning'
            )}
          >
            {paidInFull ? (
              <CircleCheckBig className="h-5 w-5" />
            ) : (
              <CreditCard className="h-5 w-5" />
            )}
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Entry fees
            </span>
            {paidInFull ? (
              <span className="text-base font-semibold leading-none text-success">
                Paid in full
              </span>
            ) : (
              // The amount owed, and what it is owed against, on one line. This
              // did not fit while the card was one quarter of a four-column
              // grid — the space came from the deletion.
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-2xl font-bold leading-none text-warning tabular-nums">
                  {formatCurrency(amountDue)}
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  due of {formatCurrency(currentFees)} entered
                </span>
              </span>
            )}
          </span>
        </span>

        {!paidInFull && (
          <span
            aria-hidden="true"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground"
          >
            <CreditCard className="h-4 w-4" />
            Finish Payment
          </span>
        )}
      </button>
    </div>
  );
}

export default CompactStatsRow;
