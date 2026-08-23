/**
 * The club admin's half of fee transparency (MYK9-229).
 *
 * INTENT: a club admin never sees a cart, so they cannot answer "why is there a
 * service fee?" when an exhibitor asks — and they are the one who decides
 * whether the club keeps using myK9Show. This is a retention surface, not only
 * a disclosure one. The retention fact goes FIRST: the club's own money is
 * untouched.
 *
 * Deliberately short. The long-form explanation lives on /fees and is linked,
 * never restated — one canonical page the club can forward verbatim.
 */

import { Link } from 'react-router-dom';
import {
  formatCartCurrency,
  formatPlatformFeeLabel,
} from '@/store/cartStore.helpers';
import { usePlatformFeeRates } from '@/hooks/queries/usePlatformFeeRates';
import { CARD_PROCESSING_COVERS_FEE_NOTE, splitPlatformFee } from './platformFeeSplit';

/** The entry subtotal the one-line example is quoted at. */
const EXAMPLE_SUBTOTAL_CENTS = 5000;

export function ClubFeeTransparencyNote({ className }: { className?: string }) {
  const rates = usePlatformFeeRates();
  const split = splitPlatformFee(EXAMPLE_SUBTOTAL_CENTS, rates);

  return (
    <section className={className}>
      <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
        <p className="text-sm font-medium">
          Your club receives 100% of entry fees. The service fee is never deducted from your
          payout.
        </p>
        <p className="text-sm text-muted-foreground">
          Exhibitors pay {formatPlatformFeeLabel(rates)} on top at checkout. Part of that is
          Stripe&rsquo;s card processing, which myK9Show neither sets nor receives, and the rest
          covers running the platform. On {formatCartCurrency(EXAMPLE_SUBTOTAL_CENTS)} of
          entries the fee is {formatCartCurrency(split.feeCents)}, of which roughly{' '}
          {formatCartCurrency(split.cardProcessingCents)} is card processing — an approximate
          figure, because Stripe&rsquo;s exact fee depends on the card and is only known after
          the payment settles.
        </p>
        {/* Without this the example can read "the fee is $10.00, of which
            roughly $10.00 is card processing" with no explanation — which is
            what happens at any percent below ~3, at every order size. */}
        {split.cardProcessingCoversWholeFee && (
          <p className="text-sm text-muted-foreground">{CARD_PROCESSING_COVERS_FEE_NOTE}</p>
        )}
        <Link to="/fees" className="inline-block text-sm underline hover:text-foreground">
          How our fees work
        </Link>
      </div>
    </section>
  );
}

export default ClubFeeTransparencyNote;
