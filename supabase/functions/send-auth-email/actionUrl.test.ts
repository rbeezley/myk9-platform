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
});
