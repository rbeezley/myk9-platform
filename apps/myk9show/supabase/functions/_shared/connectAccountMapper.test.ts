import { describe, it, expect } from 'vitest';
import { accountToRowPatch } from './connectAccountMapper';

describe('accountToRowPatch', () => {
  it('maps a fully onboarded account to enabled flags', () => {
    expect(accountToRowPatch({ details_submitted: true, payouts_enabled: true }, true)).toEqual({
      onboarding_complete: true,
      payouts_enabled: true,
      livemode: true,
    });
  });

  it('maps a fresh pre-onboarding account (both false)', () => {
    // The exact state observed creating acct_1TgaoXPQKr1pkcBI in the sandbox
    expect(accountToRowPatch({ details_submitted: false, payouts_enabled: false }, false)).toEqual({
      onboarding_complete: false,
      payouts_enabled: false,
      livemode: false,
    });
  });

  it('maps details submitted but payouts still pending verification', () => {
    expect(accountToRowPatch({ details_submitted: true, payouts_enabled: false }, false)).toEqual({
      onboarding_complete: true,
      payouts_enabled: false,
      livemode: false,
    });
  });

  it('treats missing flags as false, never undefined (a partial payload must not enable payouts)', () => {
    expect(accountToRowPatch({}, false)).toEqual({
      onboarding_complete: false,
      payouts_enabled: false,
      livemode: false,
    });
    expect(
      accountToRowPatch({ details_submitted: undefined, payouts_enabled: undefined }, false)
    ).toEqual({
      onboarding_complete: false,
      payouts_enabled: false,
      livemode: false,
    });
  });

  // MYK9-2187: a Stripe Account object carries no livemode; the event does.
  it('takes livemode from the event, so an update to a live account stays live', () => {
    expect(accountToRowPatch({ details_submitted: true, payouts_enabled: false }, true)).toEqual({
      onboarding_complete: true,
      payouts_enabled: false,
      livemode: true,
    });
  });

  it('ignores a livemode field on the account payload', () => {
    const account = { payouts_enabled: true, livemode: false } as { payouts_enabled: boolean };
    expect(accountToRowPatch(account, true).livemode).toBe(true);
  });
});
