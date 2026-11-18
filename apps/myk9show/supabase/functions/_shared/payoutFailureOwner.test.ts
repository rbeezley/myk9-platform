import { describe, expect, it } from 'vitest';
import {
  classifyPayoutFailure,
  isClubFailureReason,
  isNewClubFailureEpisode,
  stripeErrorCode,
  transferFailureOutcome,
  type PayoutFailureOwner,
} from './payoutFailureOwner';

describe('classifyPayoutFailure', () => {
  const table: Array<[string | null, PayoutFailureOwner]> = [
    // The club's to fix: its Stripe account or bank account.
    ['insufficient_capabilities_for_transfer', 'club'],
    ['account_closed', 'club'],
    ['account_frozen', 'club'],
    ['bank_account_restricted', 'club'],
    ['bank_ownership_changed', 'club'],
    ['invalid_account_number', 'club'],
    ['no_account', 'club'],
    ['incorrect_account_holder_name', 'club'],
    ['incorrect_account_holder_address', 'club'],
    ['incorrect_account_holder_tax_id', 'club'],
    ['debit_not_authorized', 'club'],
    ['bank_account_unusable', 'club'],
    ['bank_account_declined', 'club'],
    ['bank_account_verification_failed', 'club'],
    ['account_number_invalid', 'club'],
    ['routing_number_invalid', 'club'],
    // The platform's to fix: balance, rate limits, network, API and configuration.
    ['balance_insufficient', 'platform'],
    ['rate_limit', 'platform'],
    ['api_key_expired', 'platform'],
    ['platform_api_key_expired', 'platform'],
    ['idempotency_key_in_use', 'platform'],
    ['lock_timeout', 'platform'],
    ['parameter_invalid_integer', 'platform'],
    // Ambiguous, so the platform's: no club email.
    ['account_invalid', 'platform'],
    ['transfers_not_allowed', 'platform'],
    ['payouts_not_allowed', 'platform'],
    ['could_not_process', 'platform'],
    ['declined', 'platform'],
    ['invalid_currency', 'platform'],
    // Unknown or missing.
    ['some_code_stripe_adds_later', 'platform'],
    [null, 'platform'],
  ];

  it.each(table)('%s is the %s', (code, owner) => {
    expect(classifyPayoutFailure(code)).toBe(owner);
  });
});

describe('stripeErrorCode', () => {
  it('reads a Stripe error code and ignores anything else', () => {
    expect(stripeErrorCode(Object.assign(new Error('x'), { code: 'account_closed' }))).toBe(
      'account_closed'
    );
    expect(stripeErrorCode(new Error('network down'))).toBeNull();
    expect(stripeErrorCode({ code: 42 })).toBeNull();
    expect(stripeErrorCode('account_closed')).toBeNull();
    expect(stripeErrorCode(null)).toBeNull();
  });
});

describe('transferFailureOutcome', () => {
  it('a club-fixable code is the club’s and is stamped so a later run can read it', () => {
    const err = Object.assign(new Error('Destination lacks transfers'), {
      code: 'insufficient_capabilities_for_transfer',
    });
    const outcome = transferFailureOutcome(err, err.message, false);
    expect(outcome).toEqual({
      owner: 'club',
      failureReason:
        'club_account:insufficient_capabilities_for_transfer: Destination lacks transfers',
      definite: true,
    });
    expect(isClubFailureReason(outcome.failureReason)).toBe(true);
  });

  it('a balance delay keeps its self-healing marker and is the platform’s, whatever its code', () => {
    const err = Object.assign(new Error('Insufficient balance'), { code: 'balance_insufficient' });
    expect(transferFailureOutcome(err, err.message, true)).toEqual({
      owner: 'platform',
      failureReason: 'insufficient_balance: Insufficient balance',
      definite: true,
    });
  });

  it('any other failure is the platform’s and stores the message unchanged', () => {
    const err = Object.assign(new Error('Too many requests'), {
      code: 'rate_limit',
      type: 'StripeRateLimitError',
    });
    expect(transferFailureOutcome(err, err.message, false)).toEqual({
      owner: 'platform',
      failureReason: 'Too many requests',
      definite: true,
    });
    expect(transferFailureOutcome(new Error('socket hang up'), 'socket hang up', false)).toEqual({
      owner: 'platform',
      failureReason: 'socket hang up',
      definite: false,
    });
  });

  // MYK9-2183: only a request Stripe definitely rejected may mark a payout
  // failed; anything else may have moved money.
  it.each([
    ['StripeInvalidRequestError', 'invalid_request_error'],
    ['StripeCardError', 'card_error'],
    ['StripePermissionError', undefined],
    ['StripeAuthenticationError', undefined],
  ])('a %s is a definite rejection', (type, rawType) => {
    const err = Object.assign(new Error('rejected'), { type, rawType });
    expect(transferFailureOutcome(err, err.message, false).definite).toBe(true);
  });

  it.each([
    { label: 'a network error', type: 'StripeConnectionError' },
    { label: 'a Stripe server error', type: 'StripeAPIError' },
    { label: 'an idempotency error', type: 'StripeIdempotencyError' },
    { label: 'a plain error', type: undefined },
  ])('$label is not a definite rejection', ({ type }) => {
    const err = Object.assign(new Error('no answer'), { type });
    expect(transferFailureOutcome(err, err.message, false).definite).toBe(false);
  });
});

describe('isNewClubFailureEpisode', () => {
  it('a first attempt is a new episode', () => {
    expect(isNewClubFailureEpisode(null)).toBe(true);
  });

  it('a previous club-fixable failure means the club was already told', () => {
    expect(
      isNewClubFailureEpisode({ status: 'failed', failure_reason: 'club_account:no_account: x' })
    ).toBe(false);
  });

  it('a previous platform failure or a pending row starts a new episode', () => {
    expect(isNewClubFailureEpisode({ status: 'failed', failure_reason: 'rate limited' })).toBe(
      true
    );
    expect(
      isNewClubFailureEpisode({ status: 'failed', failure_reason: 'insufficient_balance: x' })
    ).toBe(true);
    expect(isNewClubFailureEpisode({ status: 'pending', failure_reason: null })).toBe(true);
  });
});
