import { describe, it, expect } from 'vitest';
import {
  STYLE_TOKENS,
  STYLE_ORG_SUPPORT,
  INK_SAVER_PALETTE,
  numberToRoman,
  resolveTokens,
} from '../pdf/pdfStyles';
import type { PremiumStyle } from '../../../types/premium-types';

// Source the style list from STYLE_TOKENS so this test self-extends as new
// styles are added.
const ALL_STYLES = Object.keys(STYLE_TOKENS) as PremiumStyle[];

describe('STYLE_TOKENS', () => {
  it('defines tokens for every PremiumStyle', () => {
    for (const style of ALL_STYLES) {
      expect(STYLE_TOKENS[style]).toBeDefined();
      expect(STYLE_TOKENS[style].displayFont).toBeTruthy();
      expect(STYLE_TOKENS[style].bodyFont).toBeTruthy();
    }
  });

  it('keeps the remaining stub styles on the standard body layout (Phase 4 pending)', () => {
    // Phase 3 promoted 'poster' to its own bodyLayout. Phase 4 will do the same
    // for gazette + fieldGuide; until then they stay on the standard body so
    // the templates render something credible.
    const stubStyles: PremiumStyle[] = ['gazette', 'fieldGuide'];
    for (const style of stubStyles) {
      expect(STYLE_TOKENS[style].bodyLayout).toBe('standard');
    }
  });

  it('promotes the poster style to its own bodyLayout (Phase 3)', () => {
    expect(STYLE_TOKENS.poster.bodyLayout).toBe('poster');
    expect(STYLE_TOKENS.poster.coverStyle).toBe('poster');
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

  it.each(ALL_STYLES)(
    'collapses the palette to high-contrast B&W for %s when inkSaver is true',
    style => {
      const base = STYLE_TOKENS[style];
      const inkSaver = resolveTokens(style, { inkSaver: true });
      expect(inkSaver.surfaceColor).toBe(INK_SAVER_PALETTE.surfaceColor);
      expect(inkSaver.accentColor).toBe(INK_SAVER_PALETTE.accentColor);
      expect(inkSaver.secondaryColor).toBe(INK_SAVER_PALETTE.secondaryColor);
      // Layout/typography fields are unchanged from the base tokens.
      expect(inkSaver.displayFont).toBe(base.displayFont);
      expect(inkSaver.bodyFont).toBe(base.bodyFont);
      expect(inkSaver.pagePadding).toBe(base.pagePadding);
      expect(inkSaver.bodyFontSize).toBe(base.bodyFontSize);
      expect(inkSaver.coverStyle).toBe(base.coverStyle);
      expect(inkSaver.bodyLayout).toBe(base.bodyLayout);
      expect(inkSaver.boldWeight).toBe(base.boldWeight);
      expect(inkSaver.textColor).toBe(base.textColor);
    }
  );

  it('passes through the base palette when inkSaver is explicitly false', () => {
    const tokens = resolveTokens('banner', { inkSaver: false });
    expect(tokens).toEqual(STYLE_TOKENS.banner);
  });
});

describe('numberToRoman', () => {
  it('maps 1 → I', () => {
    expect(numberToRoman(1)).toBe('I');
  });

  it('maps 5 → V', () => {
    expect(numberToRoman(5)).toBe('V');
  });

  it('maps 10 → X', () => {
    expect(numberToRoman(10)).toBe('X');
  });

  it('falls back to a decimal string above the lookup table (11 → "11")', () => {
    expect(numberToRoman(11)).toBe('11');
  });

  it('returns the empty-string sentinel at index 0', () => {
    expect(numberToRoman(0)).toBe('');
  });
});
