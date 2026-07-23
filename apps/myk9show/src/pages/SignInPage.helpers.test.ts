import { describe, expect, it } from 'vitest';
import {
  buildSignInPathForRedirect,
  buildSignUpPathForRedirect,
  getShowEntryRedirectShowId,
  getSignInReturnTo,
  normalizeSignInRedirect,
} from './SignInPage.helpers';

describe('sign-in redirect helpers', () => {
  it('prefers redirectTo over legacy returnTo', () => {
    const params = new URLSearchParams({
      redirectTo: '/shows/show-1/register',
      returnTo: '/exhibitor/entries',
    });

    expect(getSignInReturnTo(params)).toBe('/shows/show-1/register');
  });

  it('keeps legacy returnTo working for existing sign-in callers', () => {
    const params = new URLSearchParams({ returnTo: '/exhibitor/entries?tab=pending' });

    expect(getSignInReturnTo(params)).toBe('/exhibitor/entries?tab=pending');
  });

  it('rejects external redirects', () => {
    expect(normalizeSignInRedirect('https://example.com/shows/show-1/register')).toBeNull();
    expect(normalizeSignInRedirect('//example.com/shows/show-1/register')).toBeNull();
  });

  it('builds a sign-in URL with redirectTo for the protected route target', () => {
    expect(buildSignInPathForRedirect('/shows/show-1/register?dog=dog-1')).toBe(
      '/sign-in?redirectTo=%2Fshows%2Fshow-1%2Fregister%3Fdog%3Ddog-1'
    );
  });

  it('round-trips the onboarding landing target through an auth URL', () => {
    const target = '/?onboarding=true#get-started';
    const path = buildSignInPathForRedirect(target);

    expect(path).toBe('/sign-in?redirectTo=%2F%3Fonboarding%3Dtrue%23get-started');
    expect(getSignInReturnTo(new URLSearchParams(path.split('?')[1]))).toBe(target);
  });

  it('builds a sign-up URL without dropping the protected-flow target', () => {
    expect(buildSignUpPathForRedirect('/?onboarding=true#get-started')).toBe(
      '/sign-up?redirectTo=%2F%3Fonboarding%3Dtrue%23get-started'
    );
  });

  it('extracts show id only from show entry redirects', () => {
    expect(getShowEntryRedirectShowId('/shows/show-1/register')).toBe('show-1');
    expect(getShowEntryRedirectShowId('/shows/show-1/register?dog=dog-1')).toBe('show-1');
    expect(getShowEntryRedirectShowId('/shows/show-1')).toBeNull();
    expect(getShowEntryRedirectShowId('/exhibitor/entries')).toBeNull();
  });
});
