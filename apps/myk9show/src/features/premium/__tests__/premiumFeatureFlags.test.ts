import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isNewStyle, isStyleEnabled } from '../premiumFeatureFlags';
import type { PremiumStyle } from '../../../types/premium-types';

const LEGACY: PremiumStyle[] = ['monogram', 'banner', 'headline'];
const NEW: PremiumStyle[] = ['magazine', 'poster', 'gazette', 'fieldGuide', 'heritage'];

describe('isNewStyle', () => {
  it.each(LEGACY)('returns false for legacy style %s', style => {
    expect(isNewStyle(style)).toBe(false);
  });

  it.each(NEW)('returns true for new style %s', style => {
    expect(isNewStyle(style)).toBe(true);
  });
});

describe('isStyleEnabled', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(LEGACY)('returns true for legacy style %s regardless of env (off)', style => {
    vi.stubEnv('VITE_PREMIUM_NEW_STYLES_ENABLED', 'false');
    expect(isStyleEnabled(style)).toBe(true);
  });

  it.each(LEGACY)('returns true for legacy style %s regardless of env (on)', style => {
    vi.stubEnv('VITE_PREMIUM_NEW_STYLES_ENABLED', 'true');
    expect(isStyleEnabled(style)).toBe(true);
  });

  it.each(NEW)('returns false for new style %s when flag off', style => {
    vi.stubEnv('VITE_PREMIUM_NEW_STYLES_ENABLED', 'false');
    expect(isStyleEnabled(style)).toBe(false);
  });

  it.each(NEW)('returns true for new style %s when flag on', style => {
    vi.stubEnv('VITE_PREMIUM_NEW_STYLES_ENABLED', 'true');
    expect(isStyleEnabled(style)).toBe(true);
  });

  it('returns false for new styles when flag is empty', () => {
    vi.stubEnv('VITE_PREMIUM_NEW_STYLES_ENABLED', '');
    expect(isStyleEnabled('magazine')).toBe(false);
  });
});
