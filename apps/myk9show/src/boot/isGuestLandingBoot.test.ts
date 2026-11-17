import { describe, expect, it } from 'vitest';
import { isGuestLandingBoot } from './isGuestLandingBoot';

const at = (pathname: string, search = '', hash = '') => ({ pathname, search, hash });

describe('isGuestLandingBoot', () => {
  it('is true on the landing page with no stored session', () => {
    expect(isGuestLandingBoot(at('/'), null)).toBe(true);
  });

  it("keeps the landing page's own anchor and campaign parameters", () => {
    expect(isGuestLandingBoot(at('/', '?utm_source=newsletter', '#get-started'), null)).toBe(true);
  });

  it('is false when a session is stored on the device', () => {
    expect(isGuestLandingBoot(at('/'), 'user-1')).toBe(false);
  });

  it.each(['/sign-in', '/shows', '/at-show', '/app'])('is false on %s', pathname => {
    expect(isGuestLandingBoot(at(pathname), null)).toBe(false);
  });

  it.each(['?code=abc', '?token_hash=abc&type=signup', '?error=access_denied', '?type=recovery'])(
    'is false when an auth redirect lands on / with %s',
    search => {
      expect(isGuestLandingBoot(at('/', search), null)).toBe(false);
    }
  );

  it('is false when the fragment hands back a token', () => {
    expect(isGuestLandingBoot(at('/', '', '#access_token=abc&refresh_token=def'), null)).toBe(
      false
    );
  });
});
