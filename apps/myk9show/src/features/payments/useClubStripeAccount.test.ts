import { describe, it, expect } from 'vitest';
import { mapConnectOnboardingError } from './useClubStripeAccount';

const FALLBACK = "We couldn't start your payment setup. Please try again in a moment.";

describe('mapConnectOnboardingError', () => {
  it('falls back to friendly generic copy for unknown/technical strings', () => {
    expect(mapConnectOnboardingError('Edge Function returned a non-2xx status code')).toBe(
      FALLBACK
    );
    expect(mapConnectOnboardingError('Failed to save payment account')).toBe(FALLBACK);
    expect(mapConnectOnboardingError('Some brand new Stripe error nobody mapped')).toBe(FALLBACK);
  });

  it('falls back to generic copy for empty / nullish input', () => {
    expect(mapConnectOnboardingError(undefined)).toBe(FALLBACK);
    expect(mapConnectOnboardingError(null)).toBe(FALLBACK);
    expect(mapConnectOnboardingError('')).toBe(FALLBACK);
  });

  it('never returns a raw Stripe capability string verbatim', () => {
    // The motivating bug: this exact technical string used to render in a
    // destructive Alert to an anxious treasurer.
    const raw = 'account capability transfers is inactive';
    const mapped = mapConnectOnboardingError(raw);
    expect(mapped).not.toBe(raw);
    expect(mapped).not.toMatch(/capability/i);
    expect(mapped).toMatch(/Stripe is still verifying/i);
  });

  it('maps expired-session errors to a sign-in next step', () => {
    expect(mapConnectOnboardingError('Authentication failed')).toMatch(/sign in again/i);
    expect(mapConnectOnboardingError('Missing Authorization header')).toMatch(/sign in again/i);
  });

  it('maps a real permission denial (403) to an ask-an-admin next step', () => {
    expect(mapConnectOnboardingError('Not authorized for this club')).toMatch(
      /club administrator/i
    );
  });

  it('maps an RBAC RPC failure (500) to a retry/support message, NOT ask-an-admin', () => {
    // "Authorization check failed" means the is_club_admin RPC itself errored,
    // not that the caller lacks access — an admin must not be told to go get
    // permission they already have.
    const mapped = mapConnectOnboardingError('Authorization check failed');
    expect(mapped).not.toMatch(/club administrator/i);
    expect(mapped).toMatch(/try again|contact support/i);
  });

  it('maps network/provider reachability errors to a connection retry message', () => {
    expect(mapConnectOnboardingError('Failed to send a request to the Edge Function')).toMatch(
      /reach our payment provider/i
    );
    expect(mapConnectOnboardingError('Stripe rate limit exceeded')).toMatch(
      /reach our payment provider/i
    );
  });

  it('prefers the specific match when patterns could overlap (order matters)', () => {
    // Contains both "authorization" wording and would otherwise be ambiguous;
    // the auth-session matcher is listed first and must win.
    expect(mapConnectOnboardingError('Authentication failed')).not.toMatch(/club administrator/i);
  });
});
