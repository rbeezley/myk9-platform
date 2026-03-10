import { describe, it, expect } from 'vitest';
import { shouldSuppress } from './suppression';
import type { NotificationPreferences, SuppressionContext } from './types';
import { DEFAULT_PREFERENCES } from './types';

describe('shouldSuppress', () => {
  const defaultContext: SuppressionContext = { isInRing: false };

  it('returns false when enabled and not in ring', () => {
    expect(shouldSuppress(DEFAULT_PREFERENCES, defaultContext)).toBe(false);
  });

  it('returns true when master toggle is off', () => {
    const prefs: NotificationPreferences = { ...DEFAULT_PREFERENCES, enabled: false };
    expect(shouldSuppress(prefs, defaultContext)).toBe(true);
  });

  it('returns true when dog is in ring', () => {
    const context: SuppressionContext = { isInRing: true };
    expect(shouldSuppress(DEFAULT_PREFERENCES, context)).toBe(true);
  });

  it('returns true when both disabled and in ring', () => {
    const prefs: NotificationPreferences = { ...DEFAULT_PREFERENCES, enabled: false };
    const context: SuppressionContext = { isInRing: true };
    expect(shouldSuppress(prefs, context)).toBe(true);
  });
});
