import { describe, expect, it } from 'vitest';
import {
  ADD_YOUR_CLUB_PATH,
  addYourClubPath,
  returnPathWithClub,
  safeReturnPath,
} from '../landingCtas';
import { buildSignInPathForRedirect, getSignInReturnTo } from '@/pages/SignInPage.helpers';

describe('safeReturnPath', () => {
  it('accepts a same-origin app path', () => {
    expect(safeReturnPath('/secretary/create-show/wizard?x=1')).toBe(
      '/secretary/create-show/wizard?x=1'
    );
  });

  it.each(['//evil.com', 'https://x', 'javascript:alert(1)', 'relative/path', '', null])(
    'rejects %s',
    value => {
      expect(safeReturnPath(value)).toBeNull();
    }
  );
});

describe('addYourClubPath', () => {
  it('is the plain door with no return target or an unsafe one', () => {
    expect(addYourClubPath()).toBe(ADD_YOUR_CLUB_PATH);
    expect(addYourClubPath('//evil.com')).toBe(ADD_YOUR_CLUB_PATH);
  });

  it('carries the encoded return target', () => {
    expect(addYourClubPath('/secretary/create-show/wizard?x=1')).toBe(
      '/?onboarding=true&returnTo=%2Fsecretary%2Fcreate-show%2Fwizard%3Fx%3D1#get-started'
    );
  });
});

describe('addYourClubPath with a saved draft', () => {
  it('carries the draft id, with or without a return target', () => {
    expect(addYourClubPath(null, 'abc-1')).toBe('/?onboarding=true&clubDraft=abc-1#get-started');
    expect(addYourClubPath('/wizard?x=1', 'abc-1')).toBe(
      '/?onboarding=true&returnTo=%2Fwizard%3Fx%3D1&clubDraft=abc-1#get-started'
    );
  });

  // The id must reach the club form after sign-in, and after the confirmation link's callback,
  // which both read the target back with getSignInReturnTo.
  it('survives the sign-in redirect hop and the auth callback hop', () => {
    const target = addYourClubPath('/wizard?x=1', 'abc-1');
    const signIn = new URL(buildSignInPathForRedirect(target), 'http://x');
    expect(getSignInReturnTo(signIn.searchParams)).toBe(target);

    const callback = new URL('/auth/callback', 'http://x');
    callback.searchParams.set('redirectTo', target);
    expect(getSignInReturnTo(callback.searchParams)).toBe(target);
  });
});

describe('returnPathWithClub', () => {
  it('sets the club and replaces a stale one', () => {
    expect(returnPathWithClub('/wizard?x=1&clubId=old', 'c9')).toBe(
      '/wizard?x=1&clubId=c9&clubCreated=1'
    );
  });
});
