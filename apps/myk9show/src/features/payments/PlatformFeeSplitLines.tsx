/**
 * The cart's service-fee disclosure (MYK9-229).
 *
 * Replaces a single "Platform Fee" line with the fee plus its two parts, so an
 * exhibitor can see that a large share of it is Stripe's card processing rather
 * than myK9Show's take. Kept OUT of CartSummary so the file that owns checkout
 * gating does not also own fee copy.
 *
 * The long-form explanation lives on /fees and is LINKED, never restated here —
 * the same sentences in two places drift, and the club admin needs one URL they
 * can forward verbatim.
 */

import { Link } from 'react-router-dom';
import {
  formatCartCurrency,
  formatPlatformFeeLabel,
  type PlatformFeeRates,
} from '@/store/cartStore.helpers';
import { formatCardRateLabel, splitPlatformFee } from './platformFeeSplit';

interface PlatformFeeSplitLinesProps {
  /** Subtotal the fee is charged on, in cents. */
  subtotalCents: number;
  /** The live rates — the same ones stripe-checkout prices the charge with. */
  rates: PlatformFeeRates;
}

export function PlatformFeeSplitLines({ subtotalCents, rates }: PlatformFeeSplitLinesProps) {
  const split = splitPlatformFee(subtotalCents, rates);

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">
          Service fee ({formatPlatformFeeLabel(rates)})
        </span>
        <span>{formatCartCurrency(split.feeCents)}</span>
      </div>

      {split.feeCents > 0 && (
        <ul className="space-y-0.5 pl-3 text-xs text-muted-foreground">
          <li className="flex justify-between gap-3">
            <span>Card processing (Stripe, {formatCardRateLabel()})</span>
            <span>about {formatCartCurrency(split.cardProcessingCents)}</span>
          </li>
          <li className="flex justify-between gap-3">
            <span>myK9Show</span>
            <span>about {formatCartCurrency(split.platformShareCents)}</span>
          </li>
        </ul>
      )}

      {split.feeCents > 0 && (
        <div className="space-y-1">
          {split.cardProcessingExceedsFee && (
            <p className="text-xs text-muted-foreground">
              Card processing costs more than the whole service fee on an order this small, so
              myK9Show keeps nothing from it.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            These two amounts are approximate — Stripe&rsquo;s exact fee depends on the card and
            is only known after the payment settles. The service fee above is exact, and the club
            receives 100% of the entry fees.
          </p>
          <Link to="/fees" className="text-xs underline hover:text-foreground">
            How our fees work
          </Link>
        </div>
      )}
    </div>
  );
}

export default PlatformFeeSplitLines;
