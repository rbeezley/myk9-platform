import { describe, expect, it } from 'vitest';

import { buildAuthActionUrl } from './actionUrl.ts';

describe('buildAuthActionUrl', () => {
  it('preserves the post-confirmation destination supplied by Supabase Auth', () => {
    expect(
      buildAuthActionUrl('https://myk9show.com', {
        tokenHash: 'signup-token',
        actionType: 'signup',
        redirectTo:
          'https://myk9show.com/auth/callback?redirectTo=%2F%3Fonboarding%3Dtrue%23get-started',
      })
    ).toBe(
      'https://myk9show.com/auth/callback?redirectTo=%2F%3Fonboarding%3Dtrue%23get-started&token_hash=signup-token&type=signup'
    );
  });

  it('preserves an invitation onboarding path and token', () => {
    expect(
      buildAuthActionUrl('https://myk9show.com', {
        tokenHash: 'signup-token',
        actionType: 'signup',
        redirectTo:
          'https://myk9show.com/auth/callback?returnTo=%2Fonboarding%3Ftoken%3Dinvite-token',
      })
    ).toBe(
      'https://myk9show.com/auth/callback?returnTo=%2Fonboarding%3Ftoken%3Dinvite-token&token_hash=signup-token&type=signup'
    );
  });

  it('falls back to the canonical callback when Auth supplies no redirect', () => {
    expect(
      buildAuthActionUrl('https://myk9show.com', {
        tokenHash: 'recovery-token',
        actionType: 'recovery',
      })
    ).toBe('https://myk9show.com/auth/callback?token_hash=recovery-token&type=recovery');
  });

  it('keeps the canonical callback when Auth supplies only the default site URL', () => {
    expect(
      buildAuthActionUrl('https://myk9show.com', {
        tokenHash: 'signup-token',
        actionType: 'signup',
        redirectTo: 'https://myk9show.com',
      })
    ).toBe('https://myk9show.com/auth/callback?token_hash=signup-token&type=signup');
  });

  it('falls back to the canonical callback for a malformed redirect', () => {
    expect(
      buildAuthActionUrl('https://myk9show.com', {
        tokenHash: 'signup-token',
        actionType: 'signup',
        redirectTo: 'https://[invalid',
      })
    ).toBe('https://myk9show.com/auth/callback?token_hash=signup-token&type=signup');
  });

  it('does not preserve parameters from an untrusted redirect path', () => {
    expect(
      buildAuthActionUrl('https://myk9show.com', {
        tokenHash: 'signup-token',
        actionType: 'signup',
        redirectTo:
          'https://attacker.example/collect?redirectTo=%2Fonboarding%3Ftoken%3Dinvite-token',
      })
    ).toBe('https://myk9show.com/auth/callback?token_hash=signup-token&type=signup');
  });
});
