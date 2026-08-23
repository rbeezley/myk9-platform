/**
 * How our fees work — the ONE canonical, public, shareable fee explanation
 * (MYK9-229, decision D8).
 *
 * INTENT: a club admin must be able to forward this URL verbatim rather than
 * paraphrase it. Paraphrasing turns "about half is card processing" into
 * "myK9Show says most of it is Stripe", which is false on large orders — the
 * fixed per-transaction component makes processing a much bigger share of a
 * small order than a large one. That is why this page computes examples instead
 * of quoting one ratio, and why it must stay reachable WITHOUT signing in.
 *
 * It is a React page rather than markdown under public/legal/ for one reason:
 * every number on it is derived from `calculatePlatformFeeCents`, the same
 * expression that prices the actual charge, so a site admin changing the rate
 * on /admin/payouts cannot leave this page quoting a fee nobody is charged.
 * Static copy could not make that promise.
 */

import { Link } from 'react-router-dom';
import {
  formatCartCurrency,
  formatPlatformFeeLabel,
  type PlatformFeeRates,
} from '@/store/cartStore.helpers';
import { usePlatformFeeRatesQuery } from '@/hooks/queries/usePlatformFeeRates';
import {
  CARD_PROCESSING_COVERS_FEE_FOOTNOTE,
  CARD_PROCESSING_COVERS_FEE_NOTE,
  formatCardRateLabel,
  splitPlatformFee,
} from '@/features/payments/platformFeeSplit';

/** Realistic entry subtotals, small to large, so the ratio's swing is visible. */
const EXAMPLE_SUBTOTALS_CENTS = [2500, 5000, 10000, 20000, 50000];

function ExampleTable({ rates }: { rates: PlatformFeeRates }) {
  const rows = EXAMPLE_SUBTOTALS_CENTS.map(subtotalCents => ({
    subtotalCents,
    split: splitPlatformFee(subtotalCents, rates),
  }));
  // A $0.00 myK9Show share is a CLAMP, not an arithmetic result, and at any
  // percent below ~3 every row clamps. Publishing five bare zeros as fact is
  // exactly what the flag exists to prevent, so the table marks them.
  const anyClamped = rows.some(row => row.split.cardProcessingCoversWholeFee);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-sm">
          <caption className="sr-only">
            Approximate split of the service fee at several entry-fee subtotals
          </caption>
          <thead>
            <tr className="border-b text-left">
              <th scope="col" className="py-2 pr-4 font-medium">
                Entry fees
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Service fee
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Card processing (approx.)
              </th>
              <th scope="col" className="py-2 font-medium">
                myK9Show (approx.)
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ subtotalCents, split }) => (
              <tr key={subtotalCents} className="border-b last:border-0">
                <th scope="row" className="py-2 pr-4 text-left font-normal">
                  {formatCartCurrency(subtotalCents)}
                </th>
                <td className="py-2 pr-4">{formatCartCurrency(split.feeCents)}</td>
                <td className="py-2 pr-4">{formatCartCurrency(split.cardProcessingCents)}</td>
                <td className="py-2">
                  {formatCartCurrency(split.platformShareCents)}
                  {split.cardProcessingCoversWholeFee ? ' *' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {anyClamped && (
        <p className="text-sm text-muted-foreground">* {CARD_PROCESSING_COVERS_FEE_FOOTNOTE}</p>
      )}
    </div>
  );
}

export function FeesPage() {
  // The QUERY hook, not the display one, and deliberately so. The display hook
  // collapses loading / failure / absent into the compiled-in fallback rates —
  // correct for the cart, where a plausible number beats a blank and the server
  // is authoritative anyway. It is wrong HERE. This page's entire job is to
  // state the fee publicly, so publishing a fallback we did not read would be
  // stating a number as fact that nothing verified — and the fallback equals
  // the live values today, so it would look right until the day it silently
  // didn't. A page that admits it doesn't know beats a page that is confidently
  // stale (MYK9-229).
  const { rates, state } = usePlatformFeeRatesQuery();
  const feeLabel = rates ? formatPlatformFeeLabel(rates) : null;
  const example = rates ? splitPlatformFee(2500, rates) : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-12 sm:px-6 lg:px-8">
        <div>
          <Link
            to="/"
            className="text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            &larr; Back to myK9Show
          </Link>
        </div>

        <header className="space-y-3">
          <h1 className="text-3xl font-semibold">How our fees work</h1>
          <p className="text-muted-foreground">
            Entry fees go to the club in full. The service fee is added on top at checkout and
            covers two things.
          </p>
        </header>

        <section className="space-y-2 rounded-lg border bg-muted/30 p-5">
          <h2 className="font-semibold">Your club receives 100% of entry fees</h2>
          <p className="text-sm text-muted-foreground">
            The service fee is never deducted from a club&rsquo;s payout.{' '}
            {feeLabel
              ? `Exhibitors pay ${feeLabel} on top of the entry fees at checkout, and `
              : 'Exhibitors pay it on top of the entry fees at checkout, and '}
            the club is paid the entry fees in full.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Card processing</h2>
          <p className="text-muted-foreground">
            Card processing goes to Stripe at {formatCardRateLabel()} per transaction. myK9Show
            doesn&rsquo;t set it and doesn&rsquo;t receive it.
          </p>
          {/* Both sentences below are gated on the clamp flag, not just the
              figures. When the estimate covers the whole fee the share is 100%
              at EVERY order size, so "a bigger share of smaller orders" is
              false — and the example would read "about $0.50 of the $0.50 fee"
              as though that were computed rather than clamped. This paragraph
              is a surface that renders the split, and the contract in
              platformFeeSplit.ts applies to it too. */}
          {example && !example.cardProcessingCoversWholeFee && (
            <p className="text-muted-foreground">
              Because of the fixed per-transaction amount, it is a bigger share of smaller orders —
              on {formatCartCurrency(2500)} of entries it is about{' '}
              {formatCartCurrency(example.cardProcessingCents)} of the{' '}
              {formatCartCurrency(example.feeCents)} fee.
            </p>
          )}
          {example && example.cardProcessingCoversWholeFee && (
            <p className="text-muted-foreground">{CARD_PROCESSING_COVERS_FEE_NOTE}</p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">myK9Show&rsquo;s share</h2>
          <p className="text-muted-foreground">
            The rest funds the platform your show runs on: secure payments, online entries, ringside
            scoring, live results, and the support and development that keep it working season after
            season — year-round, not just on show weekends.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">What that looks like</h2>
          {rates ? (
            <ExampleTable rates={rates} />
          ) : (
            /* A first paint is not an error, so only the two states that
               actually failed get the warning treatment. And 'absent' (the row
               resolved and holds no usable rate) is a different fact from
               'unavailable' (we could not read it at all) — saying so costs
               one branch. */
            <p
              className={
                state === 'loading'
                  ? 'rounded-lg border p-4 text-sm text-muted-foreground'
                  : 'rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm'
              }
            >
              {state === 'loading'
                ? 'Loading the current service fee\u2026'
                : state === 'absent'
                  ? 'No service fee is configured right now, so there are no figures to show. The fee shown in your cart before you pay is always the fee you are charged.'
                  : 'We could not load the current service fee just now, so the figures are not shown rather than guessed. The fee shown in your cart before you pay is always the fee you are charged.'}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            The card-processing and myK9Show figures are approximate. Stripe&rsquo;s exact fee
            depends on the card used and is only known once the payment settles, so we can estimate
            it at checkout but not state it exactly. The service fee itself is exact, and the fee
            shown in your cart before you pay is always the fee you are charged.
          </p>
        </section>

        {/* No link to /exhibitor/payments here: it is a ProtectedRoute, and
            this page is deliberately reachable signed out — a link that lands a
            signed-out reader on an auth wall is worse than a sentence. */}
        <footer className="border-t pt-6 text-sm text-muted-foreground">
          Questions about a specific charge? Once you are signed in, every entry payment and receipt
          is listed under My Payments.
        </footer>
      </div>
    </div>
  );
}

export default FeesPage;
