import { describe, expect, it } from 'vitest';
import { resolveFixtureEmail } from './fixtureEmail';

/**
 * The bug this prevents is not "wrong address" — it is TWO CALLERS DISAGREEING.
 * `??` and `||` differ only on the empty string, which is precisely what an
 * unset GitHub secret interpolates to, so the divergence was invisible in every
 * environment where the secret existed.
 */
describe('resolveFixtureEmail', () => {
  it('uses the seeded address when the override is undefined', () => {
    expect(resolveFixtureEmail(undefined, 'secretary@myk9t.com')).toBe('secretary@myk9t.com');
  });

  it('uses the seeded address when the override is an EMPTY STRING', () => {
    // The whole point. `??` would return '' here and sign in as nobody.
    expect(resolveFixtureEmail('', 'secretary@myk9t.com')).toBe('secretary@myk9t.com');
  });

  it('uses the seeded address when the override is only whitespace', () => {
    // A secret set to a stray newline is likelier than one set to '' exactly.
    expect(resolveFixtureEmail('  \n ', 'judge@myk9t.com')).toBe('judge@myk9t.com');
  });

  it('honours a real override, trimmed', () => {
    expect(resolveFixtureEmail(' someone@myk9t.com ', 'judge@myk9t.com')).toBe(
      'someone@myk9t.com'
    );
  });
});
