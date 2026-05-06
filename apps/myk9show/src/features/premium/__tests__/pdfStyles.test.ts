import { describe, it, expect } from 'vitest';
import { STYLE_TOKENS, STYLE_ORG_SUPPORT, resolveTokens } from '../pdf/pdfStyles';
import type { PremiumStyle } from '../../../types/premium-types';

const ALL_STYLES: PremiumStyle[] = [
  'monogram',
  'banner',
  'headline',
  'magazine',
  'poster',
  'gazette',
  'fieldGuide',
  'heritage',
];

describe('STYLE_TOKENS', () => {
  it('defines tokens for every PremiumStyle', () => {
    for (const style of ALL_STYLES) {
      expect(STYLE_TOKENS[style]).toBeDefined();
      expect(STYLE_TOKENS[style].displayFont).toBeTruthy();
      expect(STYLE_TOKENS[style].bodyFont).toBeTruthy();
    }
  });

  it('keeps the 5 stub styles on the standard body layout (Phase 1 stub)', () => {
    const stubStyles: PremiumStyle[] = ['magazine', 'poster', 'gazette', 'fieldGuide', 'heritage'];
    for (const style of stubStyles) {
      expect(STYLE_TOKENS[style].bodyLayout).toBe('standard');
    }
  });
});

describe('STYLE_ORG_SUPPORT', () => {
  it('lists at least one supported org for every PremiumStyle', () => {
    for (const style of ALL_STYLES) {
      const orgs = STYLE_ORG_SUPPORT[style];
      expect(orgs).toBeDefined();
      expect(orgs.length).toBeGreaterThan(0);
    }
  });
});

describe('resolveTokens', () => {
  it('returns the base palette when inkSaver is not requested', () => {
    const tokens = resolveTokens('monogram');
    expect(tokens).toEqual(STYLE_TOKENS.monogram);
  });

  it('collapses the palette to high-contrast B&W when inkSaver is true', () => {
    const base = STYLE_TOKENS.monogram;
    const inkSaver = resolveTokens('monogram', { inkSaver: true });
    expect(inkSaver.surfaceColor).toBe('#ffffff');
    expect(inkSaver.accentColor).toBe('#000000');
    expect(inkSaver.secondaryColor).toBe('#1a1a1a');
    // Layout/typography fields are unchanged.
    expect(inkSaver.displayFont).toBe(base.displayFont);
    expect(inkSaver.bodyFont).toBe(base.bodyFont);
    expect(inkSaver.pagePadding).toBe(base.pagePadding);
    expect(inkSaver.bodyFontSize).toBe(base.bodyFontSize);
    expect(inkSaver.coverStyle).toBe(base.coverStyle);
    expect(inkSaver.bodyLayout).toBe(base.bodyLayout);
  });

  it('passes through the base palette when inkSaver is explicitly false', () => {
    const tokens = resolveTokens('banner', { inkSaver: false });
    expect(tokens).toEqual(STYLE_TOKENS.banner);
  });
});
