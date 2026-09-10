import { describe, expect, it } from 'vitest';

import {
  classifySignInFailure,
  describeSignInFailure,
  isSupabaseAuthTokenKey,
  type SignInFailureSnapshot,
} from './signInDiagnostics';

const base: SignInFailureSnapshot = {
  email: 'load-secretary@myk9t.com',
  budgetMs: 15000,
  elapsedMs: 15004,
  finalUrl: 'http://127.0.0.1:5173/sign-in?returnTo=%2Fshows',
  passwordStepReached: true,
  authTokenPresent: false,
};

describe('isSupabaseAuthTokenKey', () => {
  it('matches the project-scoped auth token key without hardcoding the ref', () => {
    expect(isSupabaseAuthTokenKey('sb-sojmvhhwsjxmfistvzbe-auth-token')).toBe(true);
    expect(isSupabaseAuthTokenKey('sb-otherproject-auth-token')).toBe(true);
  });

  it('does not match neighbouring supabase keys or unrelated storage', () => {
    // The code-verifier key exists during the PKCE exchange BEFORE a session is
    // issued, so treating it as a session would report "authenticated" for a
    // sign-in that never returned a token -- the exact distinction this module
    // exists to make.
    expect(isSupabaseAuthTokenKey('sb-sojmvhhwsjxmfistvzbe-auth-token-code-verifier')).toBe(false);
    expect(isSupabaseAuthTokenKey('sb-sojmvhhwsjxmfistvzbe-auth')).toBe(false);
    expect(isSupabaseAuthTokenKey('myk9-entry-result-replica-version')).toBe(false);
    expect(isSupabaseAuthTokenKey('')).toBe(false);
  });
});

describe('classifySignInFailure', () => {
  it('reports auth-never-returned when the password was submitted and no session landed', () => {
    expect(classifySignInFailure(base)).toBe('auth-never-returned');
  });

  it('reports authenticated-but-not-navigated when a session landed but the URL stuck', () => {
    // This is the discriminator MYK9-463 turns on: a token in storage means
    // GoTrue answered and the remaining latency is app-side render/navigation,
    // not authentication.
    expect(classifySignInFailure({ ...base, authTokenPresent: true })).toBe(
      'authenticated-but-not-navigated'
    );
  });

  it('reports rejected when the credential banner appeared', () => {
    expect(classifySignInFailure({ ...base, authErrorText: 'Invalid login credentials' })).toBe(
      'rejected'
    );
  });

  it('prefers the rejection verdict over a stale session token', () => {
    expect(
      classifySignInFailure({
        ...base,
        authTokenPresent: true,
        authErrorText: 'User is banned',
      })
    ).toBe('rejected');
  });

  it('reports never-reached-password-step when the two-step form never advanced', () => {
    expect(classifySignInFailure({ ...base, passwordStepReached: false })).toBe(
      'never-reached-password-step'
    );
  });
});

describe('describeSignInFailure', () => {
  it('names the verdict, the budget it blew, and where it stopped', () => {
    const message = describeSignInFailure(base);

    expect(message).toContain('auth-never-returned');
    expect(message).toContain('load-secretary@myk9t.com');
    expect(message).toContain('15004ms');
    expect(message).toContain('budget 15000ms');
    expect(message).toContain('/sign-in?returnTo=%2Fshows');
  });

  it('says a session was present when one was', () => {
    const message = describeSignInFailure({ ...base, authTokenPresent: true });

    expect(message).toContain('authenticated-but-not-navigated');
    expect(message).toContain('session token present');
  });

  it('says no session was present when none was', () => {
    expect(describeSignInFailure(base)).toContain('no session token');
  });

  it('quotes the rejection text when the app rejected the credentials', () => {
    const message = describeSignInFailure({ ...base, authErrorText: 'Invalid login credentials' });

    expect(message).toContain('Invalid login credentials');
  });

  it('never leaks the password, which is not part of the snapshot at all', () => {
    expect(Object.keys(base)).not.toContain('password');
  });
});
