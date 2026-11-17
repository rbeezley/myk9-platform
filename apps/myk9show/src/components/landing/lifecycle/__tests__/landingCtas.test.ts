import { describe, expect, it } from 'vitest';
import {
  ADD_YOUR_CLUB_PATH,
  addYourClubPath,
  returnPathWithClub,
  safeReturnPath,
} from '../landingCtas';

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

describe('returnPathWithClub', () => {
  it('sets the club and replaces a stale one', () => {
    expect(returnPathWithClub('/wizard?x=1&clubId=old', 'c9')).toBe(
      '/wizard?x=1&clubId=c9&clubCreated=1'
    );
  });
});
