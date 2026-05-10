import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREMIUM_STYLE,
  PREMIUM_STYLE_LABELS,
  getPremiumStyleOptions,
  resolvePremiumStyle,
  type PremiumStyle,
} from '@/types/premium-types';

describe('DEFAULT_PREMIUM_STYLE', () => {
  it('is monogram', () => {
    expect(DEFAULT_PREMIUM_STYLE).toBe('monogram');
  });
});

describe('resolvePremiumStyle', () => {
  it('returns the style when it is a valid PremiumStyle', () => {
    const styles: PremiumStyle[] = [
      'monogram',
      'banner',
      'headline',
      'magazine',
      'poster',
      'gazette',
      'fieldGuide',
      'heritage',
    ];
    for (const style of styles) {
      expect(resolvePremiumStyle(style)).toBe(style);
    }
  });

  it('returns DEFAULT_PREMIUM_STYLE for null', () => {
    expect(resolvePremiumStyle(null)).toBe(DEFAULT_PREMIUM_STYLE);
  });

  it('returns DEFAULT_PREMIUM_STYLE for undefined', () => {
    expect(resolvePremiumStyle(undefined)).toBe(DEFAULT_PREMIUM_STYLE);
  });

  it('returns DEFAULT_PREMIUM_STYLE for an unknown string', () => {
    expect(resolvePremiumStyle('unknown-style')).toBe(DEFAULT_PREMIUM_STYLE);
    expect(resolvePremiumStyle('')).toBe(DEFAULT_PREMIUM_STYLE);
    expect(resolvePremiumStyle('MONOGRAM')).toBe(DEFAULT_PREMIUM_STYLE);
  });
});

describe('getPremiumStyleOptions', () => {
  it('includes all PremiumStyle values', () => {
    const options = getPremiumStyleOptions();
    const optionValues = options.map(o => o.value);
    for (const style of Object.keys(PREMIUM_STYLE_LABELS) as PremiumStyle[]) {
      expect(optionValues).toContain(style);
    }
    expect(options).toHaveLength(Object.keys(PREMIUM_STYLE_LABELS).length);
  });

  it('marks the default style with "(default)" in its label', () => {
    const options = getPremiumStyleOptions();
    const defaultOption = options.find(o => o.value === DEFAULT_PREMIUM_STYLE);
    expect(defaultOption?.label).toContain('(default)');
  });

  it('does not mark non-default styles with "(default)"', () => {
    const options = getPremiumStyleOptions();
    for (const opt of options) {
      if (opt.value !== DEFAULT_PREMIUM_STYLE) {
        expect(opt.label).not.toContain('(default)');
      }
    }
  });
});
