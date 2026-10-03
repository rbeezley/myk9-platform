import type { DroppedCartItem, PaymentLinkOutcome } from '@/store/cartStore.types';

const isAre = (count: number) => (count === 1 ? 'is' : 'are');
const needs = (count: number) => (count === 1 ? 'needs' : 'need');

/**
 * The payment-link notice's words, by the outcome derived from the LIVE cart
 * (MYK9-873). Every branch ends on an action the page it renders on has:
 * Checkout when the cart has lines (`some-missing` guarantees it); with no lines,
 * "add back" (a reload of the link, which refills an empty cart) for entries that
 * still need paying, and the My Entries link always.
 */
export function paymentLinkNoticeCopy(outcome: PaymentLinkOutcome): {
  heading: string;
  sentences: string[];
  /** Offer to re-run the link's refill: `none-left` with entries still to pay. */
  addBack: 'it' | 'them' | null;
  linkToMyEntries: boolean;
} | null {
  const { kind, requested, unavailable, stillUnpaid } = outcome;
  if (kind === 'all-present' || kind === 'failed') return null;

  const sentences: string[] = [];
  if (unavailable > 0) {
    sentences.push(
      `${unavailable} ${isAre(unavailable)} already paid, withdrawn, or no longer open for payment.`
    );
  }

  if (kind === 'none-left') {
    if (stillUnpaid > 0) sentences.push(`${stillUnpaid} still ${needs(stillUnpaid)} paying.`);
    return {
      heading:
        requested === 1
          ? 'The entry in your payment link is not in your cart.'
          : `None of the ${requested} entries in your payment link are in your cart.`,
      sentences,
      addBack: stillUnpaid === 0 ? null : stillUnpaid === 1 ? 'it' : 'them',
      linkToMyEntries: true,
    };
  }

  if (stillUnpaid > 0) {
    sentences.push(
      `${stillUnpaid} still ${needs(stillUnpaid)} paying. Check out this cart first, then open your payment link again.`
    );
  }
  const missing = unavailable + stillUnpaid;
  return {
    heading: `${missing} of the ${requested} entries in your payment link ${isAre(missing)} not in this cart.`,
    sentences,
    addBack: null,
    linkToMyEntries: unavailable > 0,
  };
}

/** "Rover in Novice Exterior: this class was cancelled." (MYK9-656) */
export function describeDroppedItem(item: DroppedCartItem): string {
  const what = [item.dogName, item.className].filter(Boolean).join(' in ') || 'One class';
  const why = item.reason.charAt(0).toLowerCase() + item.reason.slice(1);
  return `${what}: ${why}.`;
}
