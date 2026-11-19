import { describe, expect, it } from 'vitest';
import {
  CLUB_ACCOUNT_LOOKUP_FAILED_ERROR,
  CLUB_PAYOUTS_OFF_ERROR,
  clubPayoutsRefusal,
} from './clubPayoutsGate';

describe('clubPayoutsRefusal (MYK9-2193)', () => {
  it('lets the payment through when the lookup found a payouts-enabled account', () => {
    expect(clubPayoutsRefusal({ data: { payouts_enabled: true }, error: null })).toBeNull();
  });

  it('answers a failed lookup with a retryable 500, never the payouts-off 403', () => {
    expect(
      clubPayoutsRefusal({ data: null, error: { message: 'connection reset', code: '08006' } })
    ).toEqual({ status: 500, error: CLUB_ACCOUNT_LOOKUP_FAILED_ERROR });
  });

  it('treats a failed lookup as a failure even when data came back', () => {
    expect(
      clubPayoutsRefusal({ data: { payouts_enabled: true }, error: { message: 'boom' } })
    ).toEqual({ status: 500, error: CLUB_ACCOUNT_LOOKUP_FAILED_ERROR });
  });

  it('refuses with the payouts-off 403 when the account has payouts off', () => {
    expect(clubPayoutsRefusal({ data: { payouts_enabled: false }, error: null })).toEqual({
      status: 403,
      error: CLUB_PAYOUTS_OFF_ERROR,
    });
  });

  it('refuses with the payouts-off 403 when the club has no account in this Stripe mode', () => {
    // The query filters on the platform's livemode, so an account that exists
    // only in the other mode comes back as no row.
    expect(clubPayoutsRefusal({ data: null, error: null })).toEqual({
      status: 403,
      error: CLUB_PAYOUTS_OFF_ERROR,
    });
  });

  it('keeps the payouts-off sentence the app keys on, byte for byte', () => {
    expect(CLUB_PAYOUTS_OFF_ERROR).toBe(
      "This club's payment account is not set up to receive online entry fees."
    );
  });

  it('words the lookup failure as try again', () => {
    expect(CLUB_ACCOUNT_LOOKUP_FAILED_ERROR).toMatch(/try again/i);
    expect(CLUB_ACCOUNT_LOOKUP_FAILED_ERROR).not.toContain('—');
  });
});
