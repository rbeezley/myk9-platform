/**
 * MYK9-2166: when Stripe turns a club's payouts off after a show is published, the show stays up and
 * card (online) entry pauses. Check and cash entries keep going. The cart and a wait-list Pay say
 * the same thing, so the wording lives here once.
 *
 * "Paused" is the word on purpose: nothing she did is wrong and no charge failed.
 */

/**
 * The 403 sentence stripe-checkout and stripe-payment-link answer with when the club's payouts are
 * off. Neither sends a code, so this exact body is the only discriminator. It mirrors
 * supabase/functions/stripe-checkout/index.ts and stripe-payment-link/index.ts; a test pins it to
 * both sources.
 */
export const CLUB_PAYOUTS_OFF_SERVER_MESSAGE =
  "This club's payment account is not set up to receive online entry fees.";

/** True only for the payouts-off 403. Any other 403 keeps its own wording. */
export function isPayoutsOffRefusal(status: number | null, message: string | undefined): boolean {
  return status === 403 && message === CLUB_PAYOUTS_OFF_SERVER_MESSAGE;
}

/** What is paused, and why in one clause. */
const CARD_PAUSED_LEAD =
  "Card payment is paused for this show. The club's bank account needs attention.";

/** The cart and a My Shows pay link: she is already holding an entry, so say nothing was charged. */
export const CART_CARD_PAUSED_MESSAGE = `${CARD_PAUSED_LEAD} Nothing was charged. Please contact the show secretary to ask how else you can pay.`;

/** A wait-list offer's Pay. */
export const WAITLIST_CARD_PAUSED_MESSAGE = `${CARD_PAUSED_LEAD} Please contact the show secretary to ask how else you can pay.`;
