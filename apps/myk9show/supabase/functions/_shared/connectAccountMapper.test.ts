import { describe, it, expect } from 'vitest';
import { accountToRowPatch } from './connectAccountMapper';

describe('accountToRowPatch', () => {
  it('maps a fully onboarded account to enabled flags', () => {
    expect(accountToRowPatch({ details_submitted: true, payouts_enabled: true })).toEqual({
      onboarding_complete: true,
      payouts_enabled: true,
    });
  });

  it('maps a fresh pre-onboarding account (both false)', () => {
    // The exact state observed creating acct_1TgaoXPQKr1pkcBI in the sandbox
    expect(accountToRowPatch({ details_submitted: false, payouts_enabled: false })).toEqual({
      onboarding_complete: false,
      payouts_enabled: false,
    });
  });

  it('maps details submitted but payouts still pending verification', () => {
    expect(accountToRowPatch({ details_submitted: true, payouts_enabled: false })).toEqual({
      onboarding_complete: true,
      payouts_enabled: false,
    });
  });

  it('treats missing fields as false, never undefined (a partial payload must not enable payouts)', () => {
    expect(accountToRowPatch({})).toEqual({
      onboarding_complete: false,
      payouts_enabled: false,
    });
    expect(accountToRowPatch({ details_submitted: undefined, payouts_enabled: undefined })).toEqual({
      onboarding_complete: false,
      payouts_enabled: false,
    });
  });
});
