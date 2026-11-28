import { describe, expect, it } from 'vitest';
import {
  ADD_YOUR_CLUB_PATH,
  addYourClubPath,
  isAddYourClubTarget,
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

describe('addYourClubPath through sign-in', () => {
  // The target must reach the club form after sign-in, and after the confirmation link's
  // callback, which both read it back with getSignInReturnTo (MYK9-2547).
  it('survives the sign-in redirect hop and the auth callback hop', () => {
    const target = addYourClubPath('/wizard?x=1');
    const signIn = new URL(buildSignInPathForRedirect(target), 'http://x');
    expect(getSignInReturnTo(signIn.searchParams)).toBe(target);

    const callback = new URL('/auth/callback', 'http://x');
    callback.searchParams.set('redirectTo', target);
    expect(getSignInReturnTo(callback.searchParams)).toBe(target);
  });
});

describe('isAddYourClubTarget', () => {
  it('is true only for the club form address', () => {
    expect(isAddYourClubTarget(addYourClubPath())).toBe(true);
    expect(isAddYourClubTarget(addYourClubPath('/wizard?x=1'))).toBe(true);
    expect(isAddYourClubTarget('/')).toBe(false);
    expect(isAddYourClubTarget('/shows?onboarding=true')).toBe(false);
  });
});

describe('returnPathWithClub', () => {
  it('sets the club and replaces a stale one', () => {
    expect(returnPathWithClub('/wizard?x=1&clubId=old', 'c9')).toBe(
      '/wizard?x=1&clubId=c9&clubCreated=1'
    );
  });
});
