import { describe, expect, it } from 'vitest';
import { isStripeLiveMode } from './stripeMode';

describe('isStripeLiveMode', () => {
  it('detects live mode from sk_live keys', () => {
    expect(isStripeLiveMode('sk_live_123')).toBe(true);
  });

  it('treats test, restricted, missing, and unknown keys as non-live', () => {
    expect(isStripeLiveMode('sk_test_123')).toBe(false);
    expect(isStripeLiveMode('rk_live_123')).toBe(false);
    expect(isStripeLiveMode(undefined)).toBe(false);
    expect(isStripeLiveMode('')).toBe(false);
  });
});
