import type { DroppedCartItem, StoredPaymentLinkOutcome } from '@/store/cartStore.types';

const isAre = (count: number) => (count === 1 ? 'is' : 'are');

/**
 * The payment-link notice's words, by outcome (MYK9-873). Every branch ends on an
 * action the page it renders on actually has: Checkout when the cart has lines
 * (`some-missing` guarantees it), the My Entries link otherwise.
 */
export function paymentLinkNoticeCopy(outcome: StoredPaymentLinkOutcome): {
  heading: string;
  sentences: string[];
  linkToMyEntries: boolean;
} | null {
  const { kind, requested, unavailable, stillUnpaid } = outcome;
  if (kind === 'all-present') return null;

  const sentences: string[] = [];
  if (unavailable > 0) {
    sentences.push(
      `${unavailable} ${isAre(unavailable)} already paid, withdrawn, or no longer open for payment.`
    );
  }

  if (kind === 'none-left') {
    if (stillUnpaid > 0) sentences.push(`${stillUnpaid} could not be added to a cart.`);
    return {
      heading:
        requested === 1
          ? 'The entry in your payment link cannot be paid here.'
          : `None of the ${requested} entries in your payment link can be paid here.`,
      sentences,
      linkToMyEntries: true,
    };
  }

  if (stillUnpaid > 0) {
    sentences.push(
      `${stillUnpaid} still ${stillUnpaid === 1 ? 'needs' : 'need'} paying. Check out this cart first, then open your payment link again.`
    );
  }
  const missing = unavailable + stillUnpaid;
  return {
    heading: `${missing} of the ${requested} entries in your payment link ${isAre(missing)} not in this cart.`,
    sentences,
    linkToMyEntries: unavailable > 0,
  };
}

/** "Rover in Novice Exterior: this class was cancelled." (MYK9-656) */
export function describeDroppedItem(item: DroppedCartItem): string {
  const what = [item.dogName, item.className].filter(Boolean).join(' in ') || 'One class';
  const why = item.reason.charAt(0).toLowerCase() + item.reason.slice(1);
  return `${what}: ${why}.`;
}
