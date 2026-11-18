// Whose failure is a failed payout transfer: the club's or the platform's (MYK9-1986).
//
// A failure the CLUB must fix (its Stripe account cannot take the money, its bank
// account is closed or wrong) emails the club's admins, once per failure episode.
// A failure the PLATFORM must fix (balance still clearing, rate limit, network,
// an API or configuration problem, anything unrecognised) stays with the owner's
// alert and emails no one at the club.
//
// This is NOT the treasurer badge's split (features/payments/payoutBadge.ts):
// that one separates "retries on its own" from "needs a look", and a platform
// failure can need a look without being anything the club can fix.
//
// Pure module: no Deno or npm imports, so the colocated vitest runs under Node.

export type PayoutFailureOwner = 'club' | 'platform';

/**
 * Stripe error / payout failure codes that only the club can fix, from its own
 * Stripe account or bank. Every code not listed is the platform's, on purpose:
 * an unknown code must never email a club about a problem it cannot act on.
 *
 * Deliberately left to the platform (ambiguous): `account_invalid` (also a wrong
 * account id or mode on our side), `transfers_not_allowed` and
 * `payouts_not_allowed` (Stripe-side restrictions the platform raises with
 * Stripe), `could_not_process`, `declined`, `invalid_currency`.
 */
export const CLUB_FIXABLE_FAILURE_CODES: ReadonlySet<string> = new Set([
  // The club's Stripe account has not finished what Stripe needs to receive transfers.
  'insufficient_capabilities_for_transfer',
  // The club's bank account (Stripe payout failure codes and bank-account errors).
  'account_closed',
  'account_frozen',
  'bank_account_restricted',
  'bank_ownership_changed',
  'invalid_account_number',
  'no_account',
  'incorrect_account_holder_name',
  'incorrect_account_holder_address',
  'incorrect_account_holder_tax_id',
  'debit_not_authorized',
  'bank_account_unusable',
  'bank_account_declined',
  'bank_account_verification_failed',
  'account_number_invalid',
  'routing_number_invalid',
]);

/** `failure_reason` prefix the cron stamps on a club-fixable failure, so a later run can read it. */
export const CLUB_FAILURE_REASON_PREFIX = 'club_account';

/** The Stripe error code carried by a thrown Stripe error, if any. */
export function stripeErrorCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' && code.length > 0 ? code : null;
}

/** The one classification: a known club-fixable code is the club's; anything else is the platform's. */
export function classifyPayoutFailure(code: string | null | undefined): PayoutFailureOwner {
  return code && CLUB_FIXABLE_FAILURE_CODES.has(code) ? 'club' : 'platform';
}

/** The `failure_reason` stored for a club-fixable failure: `club_account:<code>: <message>`. */
export function clubFailureReason(code: string, message: string): string {
  return `${CLUB_FAILURE_REASON_PREFIX}:${code}: ${message}`;
}

/** True when a stored `failure_reason` was stamped as the club's to fix. */
export function isClubFailureReason(reason: string | null | undefined): boolean {
  return !!reason && reason.startsWith(`${CLUB_FAILURE_REASON_PREFIX}:`);
}

/**
 * Stripe error classes (stripe-node `type`, or the API's `rawType`) that mean
 * Stripe answered and refused the request, so no transfer was made (MYK9-2183).
 * A connection error, a Stripe server error, an idempotency conflict or
 * anything unrecognised may have moved money and is not on this list.
 */
const DEFINITE_REJECTION_TYPES: ReadonlySet<string> = new Set([
  'StripeCardError',
  'card_error',
  'StripeInvalidRequestError',
  'invalid_request_error',
  'StripePermissionError',
  'StripeAuthenticationError',
  'StripeRateLimitError',
]);

function isDefiniteRejection(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const { type, rawType } = err as { type?: unknown; rawType?: unknown };
  return [type, rawType].some(t => typeof t === 'string' && DEFINITE_REJECTION_TYPES.has(t));
}

/**
 * Whose failure a thrown transfer error is, the `failure_reason` to store, and
 * whether Stripe definitely refused it (`definite`). Only a definite refusal
 * may mark a payout failed; otherwise money may have moved (MYK9-2183).
 * A card-clearing balance delay (`benign`) keeps its `insufficient_balance:`
 * marker and is always the platform's; a club-fixable code is stamped with the
 * club prefix; anything else stores the message unchanged, as before.
 */
export function transferFailureOutcome(
  err: unknown,
  message: string,
  benign: boolean
): { owner: PayoutFailureOwner; failureReason: string; definite: boolean } {
  if (benign) {
    return { owner: 'platform', failureReason: `insufficient_balance: ${message}`, definite: true };
  }
  const code = stripeErrorCode(err);
  if (code && classifyPayoutFailure(code) === 'club') {
    return { owner: 'club', failureReason: clubFailureReason(code, message), definite: true };
  }
  return { owner: 'platform', failureReason: message, definite: isDefiniteRejection(err) };
}

export interface PayoutAttempt {
  status: string;
  failure_reason: string | null;
}

/**
 * Once per failure episode, not once a night. The cron opens a fresh row for
 * every retry, so the episode is read from the show's attempt just before this
 * one: if that attempt already failed for a club reason, the club was told then.
 * Any other previous attempt (none, a platform failure) starts a new episode.
 */
export function isNewClubFailureEpisode(previousAttempt: PayoutAttempt | null): boolean {
  if (!previousAttempt) return true;
  return !(
    previousAttempt.status === 'failed' && isClubFailureReason(previousAttempt.failure_reason)
  );
}
