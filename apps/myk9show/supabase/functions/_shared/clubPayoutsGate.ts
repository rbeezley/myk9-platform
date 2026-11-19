// Club payout gate for stripe-checkout and stripe-payment-link (MYK9-2193).
//
// Before taking a card payment both functions read the club's Stripe account
// (club_stripe_accounts, filtered to the platform's livemode). The charge lands
// in the platform account and is paid out later, so a club without a
// payouts-enabled account in this mode is refused with a 403 the app keys on.
//
// A lookup that FAILED says nothing about the club's payouts: it answers with a
// retryable 500 instead, so the exhibitor reads "try again" rather than "the
// club's bank account needs attention". Neither refusal creates anything.

export const CLUB_PAYOUTS_OFF_ERROR =
  "This club's payment account is not set up to receive online entry fees.";

export const CLUB_ACCOUNT_LOOKUP_FAILED_ERROR =
  "We could not check the club's payment account. Please try again.";

export interface ClubAccountLookup {
  data: { payouts_enabled: boolean | null } | null;
  error: unknown;
}

export interface ClubPayoutsRefusal {
  status: 403 | 500;
  error: string;
}

/** Why the club cannot take this card payment, or `null` when it can. */
export function clubPayoutsRefusal(lookup: ClubAccountLookup): ClubPayoutsRefusal | null {
  if (lookup.error) return { status: 500, error: CLUB_ACCOUNT_LOOKUP_FAILED_ERROR };
  if (lookup.data?.payouts_enabled !== true) {
    return { status: 403, error: CLUB_PAYOUTS_OFF_ERROR };
  }
  return null;
}
