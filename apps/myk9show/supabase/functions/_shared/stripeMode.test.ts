import { describe, expect, it } from 'vitest';
import { requireStripeLivemode, stripeKeyMode } from './stripeMode';

describe('stripeKeyMode (MYK9-2187)', () => {
  it('reads secret and restricted live keys as live', () => {
    expect(stripeKeyMode('sk_live_123')).toBe('live');
    expect(stripeKeyMode('rk_live_123')).toBe('live');
  });

  it('reads secret and restricted test keys as test', () => {
    expect(stripeKeyMode('sk_test_123')).toBe('test');
    expect(stripeKeyMode('rk_test_123')).toBe('test');
  });

  it('reads anything else as unknown, never as test', () => {
    for (const key of [
      undefined,
      null,
      '',
      'sk_live',
      'pk_live_123',
      'pk_test_123',
      'whsec_123',
      ' sk_live_123',
      'SK_LIVE_123',
    ]) {
      expect(stripeKeyMode(key)).toBe('unknown');
    }
  });
});

describe('requireStripeLivemode', () => {
  it('answers true for a live key and false for a test key', () => {
    expect(requireStripeLivemode('rk_live_123')).toBe(true);
    expect(requireStripeLivemode('sk_live_123')).toBe(true);
    expect(requireStripeLivemode('sk_test_123')).toBe(false);
    expect(requireStripeLivemode('rk_test_123')).toBe(false);
  });

  it('refuses to start on a key whose mode is unknown', () => {
    expect(() => requireStripeLivemode('pk_live_123')).toThrow(/neither a live nor a test/);
    expect(() => requireStripeLivemode(undefined)).toThrow(/neither a live nor a test/);
  });
});
