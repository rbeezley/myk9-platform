import { describe, it, expect } from 'vitest';
import { canEnableOnlineEntries } from '../onlineEntryGate';

describe('canEnableOnlineEntries', () => {
  it('allows publishing when payouts are enabled', () => {
    expect(canEnableOnlineEntries({ payouts_enabled: true })).toBe(true);
  });

  it('fails closed when the club has no Stripe account row', () => {
    expect(canEnableOnlineEntries(null)).toBe(false);
    expect(canEnableOnlineEntries(undefined)).toBe(false);
  });

  it('fails closed while onboarding is incomplete or payouts are pending', () => {
    expect(canEnableOnlineEntries({ payouts_enabled: false })).toBe(false);
  });
});
