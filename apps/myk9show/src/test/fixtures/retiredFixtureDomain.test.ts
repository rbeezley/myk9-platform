import { describe, expect, it } from 'vitest';
import { assertAddressIsLive, retiredDomainOf } from './retiredFixtureDomain';

/**
 * The failure this guards against was expensive precisely because it was
 * silent: a stale `E2E_*_EMAIL` override pointed at an account with no
 * `auth.users` row, and Supabase reported it as `Invalid login credentials` —
 * the same string a wrong password produces. Every minute of that debugging
 * session went into the password.
 *
 * So the assertions below are about the MESSAGE as much as the throw. A guard
 * that stops the run without naming the cause would send the next reader back
 * to the password, which is the bug.
 */
describe('retired fixture domains', () => {
  it('rejects an address on the retired domain', () => {
    expect(() => assertAddressIsLive('e2e-judge@test.myk9.com')).toThrow();
  });

  it('names the cause and the fix, not just the failure', () => {
    let message = '';
    try {
      assertAddressIsLive('e2e-secretary@test.myk9.com');
    } catch (error) {
      message = (error as Error).message;
    }

    // The address, so the reader knows which override to hunt for.
    expect(message).toContain('e2e-secretary@test.myk9.com');
    // The misleading string, so a search for it lands here.
    expect(message).toContain('Invalid login credentials');
    // Where the stale value lives.
    expect(message).toContain('.env.local');
    // What to do instead.
    expect(message).toContain('@myk9t.com');
  });

  it('is case-insensitive, because env values are hand-edited', () => {
    expect(() => assertAddressIsLive('E2E-Admin@Test.MyK9.com')).toThrow();
  });

  it('allows every live fixture address', () => {
    // The canonical set from testUsers.ts. If a future rename moves these onto
    // a domain that later gets retired, this fails loudly rather than blocking
    // sign-in at runtime.
    for (const email of [
      'testadmin@myk9t.com',
      'secretary@myk9t.com',
      'judge@myk9t.com',
      'clubadmin@myk9t.com',
      'exhibitor@myk9t.com',
    ]) {
      expect(() => assertAddressIsLive(email)).not.toThrow();
    }
  });

  it('does not match a domain that merely CONTAINS the retired one', () => {
    // A substring check would reject `test.myk9.com.au` or
    // `nottest.myk9.com`. The comparison is on the whole domain.
    expect(retiredDomainOf('someone@nottest.myk9.com')).toBeNull();
    expect(retiredDomainOf('someone@test.myk9.com.au')).toBeNull();
    expect(retiredDomainOf('someone@test.myk9.com')).toBe('test.myk9.com');
  });

  it('ignores an input with no domain rather than throwing on it', () => {
    // `signIn` already rejects an empty email with its own message; this guard
    // must not pre-empt that with a confusing one.
    expect(retiredDomainOf('')).toBeNull();
    expect(retiredDomainOf('no-at-sign')).toBeNull();
  });
});
