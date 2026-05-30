/**
 * Unit tests for the Phase 1b credential classifier.
 *
 * Assertion-first against the EXACT strings the field can emit — including a
 * trailing-space value and a zero-width-prefixed paste (the ui-id-shapes
 * convention: test the real input, not the canonical form). Zero-width inputs
 * are built via String.fromCharCode so the source stays plain ASCII.
 */

import { describe, it, expect } from 'vitest';
import { classifyCredential, normalizeCredential } from './SmartSignInPage.helpers';

const ZWSP = String.fromCharCode(0x200b); // zero-width space (common in pasted text)
const BOM = String.fromCharCode(0xfeff); // byte-order mark

describe('normalizeCredential', () => {
  it('strips edge whitespace + zero-width chars and lowercases', () => {
    expect(normalizeCredential('  Foo@Bar.com  ')).toBe('foo@bar.com');
    expect(normalizeCredential(`${ZWSP}eh2p9`)).toBe('eh2p9');
    expect(normalizeCredential(`aa260${BOM}`)).toBe('aa260');
  });

  it('preserves internal whitespace (so classify can reject it)', () => {
    expect(normalizeCredential(' a b ')).toBe('a b');
  });
});

describe('classifyCredential', () => {
  it('classifies emails by @ presence (no full RFC validation)', () => {
    expect(classifyCredential('jane@example.com')).toBe('email');
    expect(classifyCredential('  Jane@Example.com ')).toBe('email');
    expect(classifyCredential('not-an-email@')).toBe('email'); // @ is the branch signal only
  });

  it('classifies all five passcode prefixes (a/j/s/e + 4 chars)', () => {
    expect(classifyCredential('aa260')).toBe('passcode'); // admin
    expect(classifyCredential('j9f3b')).toBe('passcode'); // judge
    expect(classifyCredential('s1234')).toBe('passcode'); // steward
    expect(classifyCredential('eh2p9')).toBe('passcode'); // exhibitor
  });

  it('classifies a trailing-space passcode after normalization', () => {
    expect(classifyCredential('eh2p9 ')).toBe('passcode');
  });

  it('classifies a zero-width-prefixed pasted passcode', () => {
    expect(classifyCredential(`${ZWSP}eh2p9`)).toBe('passcode');
  });

  it('rejects the empty string', () => {
    expect(classifyCredential('')).toBe('invalid');
    expect(classifyCredential('   ')).toBe('invalid');
  });

  it('rejects internal whitespace / newlines (even with an @)', () => {
    expect(classifyCredential('foo bar')).toBe('invalid');
    expect(classifyCredential('a b@c.com')).toBe('invalid');
    expect(classifyCredential('aa\n260')).toBe('invalid');
  });

  it('rejects a 5-char string with a bad role prefix or non-alphanumeric body', () => {
    expect(classifyCredential('xa260')).toBe('invalid'); // x is not a role letter
    expect(classifyCredential('aa2!0')).toBe('invalid'); // body not [a-z0-9]
  });

  it('rejects wrong-length almost-passcodes', () => {
    expect(classifyCredential('aa26')).toBe('invalid'); // 4 chars
    expect(classifyCredential('aa2609')).toBe('invalid'); // 6 chars
  });
});
