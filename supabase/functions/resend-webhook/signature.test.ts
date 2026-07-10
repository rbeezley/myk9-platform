import { describe, expect, it } from 'vitest';

import { matchesAnySignature } from './signature';

describe('resend-webhook signature comparison (SA-023)', () => {
  it('accepts when a candidate matches the expected signature exactly', () => {
    expect(matchesAnySignature(['abc123'], 'abc123')).toBe(true);
  });

  it('accepts when the matching signature is one of several candidates', () => {
    expect(matchesAnySignature(['nope', 'abc123', 'also-nope'], 'abc123')).toBe(true);
  });

  it('rejects when no candidate matches', () => {
    expect(matchesAnySignature(['nope', 'still-nope'], 'abc123')).toBe(false);
  });

  it('rejects an empty candidate list (fail closed)', () => {
    expect(matchesAnySignature([], 'abc123')).toBe(false);
  });

  it('rejects a candidate that differs only in length (prefix match is not a match)', () => {
    expect(matchesAnySignature(['abc12'], 'abc123')).toBe(false);
    expect(matchesAnySignature(['abc1234'], 'abc123')).toBe(false);
  });

  it('rejects a candidate that differs by a single trailing byte', () => {
    expect(matchesAnySignature(['abc124'], 'abc123')).toBe(false);
  });

  it('is case sensitive', () => {
    expect(matchesAnySignature(['ABC123'], 'abc123')).toBe(false);
  });
});
