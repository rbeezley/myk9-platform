import { describe, expect, it } from 'vitest';
import { isGuestLandingBoot } from './isGuestLandingBoot';

const at = (pathname: string, search = '', hash = '') => ({ pathname, search, hash });
const noSession = () => null;
const session = () => 'user-1';

describe('isGuestLandingBoot', () => {
  it('is true on the landing page with no stored session', () => {
    expect(isGuestLandingBoot(at('/'), noSession)).toBe(true);
  });

  it("keeps the landing page's own anchor and campaign parameters", () => {
    expect(isGuestLandingBoot(at('/', '?utm_source=newsletter', '#get-started'), noSession)).toBe(
      true
    );
  });

  it('is false when a session is stored on the device', () => {
    expect(isGuestLandingBoot(at('/'), session)).toBe(false);
  });

  it('is false, and does not throw, when the browser refuses storage access', () => {
    const refused = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
    expect(isGuestLandingBoot(at('/'), refused)).toBe(false);
  });

  it.each(['/sign-in', '/shows', '/at-show', '/app'])('is false on %s', pathname => {
    expect(isGuestLandingBoot(at(pathname), noSession)).toBe(false);
  });

  it.each(['?code=abc', '?token_hash=abc&type=signup', '?error=access_denied', '?type=recovery'])(
    'is false when an auth redirect lands on / with %s',
    search => {
      expect(isGuestLandingBoot(at('/', search), noSession)).toBe(false);
    }
  );

  it('is false when the fragment hands back a token', () => {
    expect(isGuestLandingBoot(at('/', '', '#access_token=abc&refresh_token=def'), noSession)).toBe(
      false
    );
  });
});
