import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolvePremiumStyle, SHOW_STYLE_COLUMN } from './premiumStyle.ts';

describe('resolvePremiumStyle (MYK9-2056)', () => {
  it("uses the show's own style over its club template's", () => {
    expect(resolvePremiumStyle('gazette', 'banner')).toBe('gazette');
  });

  it("falls back to the template's style, then monogram", () => {
    expect(resolvePremiumStyle(null, 'banner')).toBe('banner');
    expect(resolvePremiumStyle(undefined, null)).toBe('monogram');
    expect(resolvePremiumStyle('', undefined)).toBe('monogram');
  });

  it('remaps pre-migration-191 names', () => {
    expect(resolvePremiumStyle('classic', null)).toBe('monogram');
    expect(resolvePremiumStyle(null, 'modern')).toBe('banner');
  });

  it("is read by the generator's shows select, so the show's style is ever seen", () => {
    const source = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');
    const showsSelect = source.slice(source.indexOf(".from('shows')"), source.indexOf('.single()'));
    expect(showsSelect).toContain('${SHOW_STYLE_COLUMN}');
    expect(SHOW_STYLE_COLUMN).toBe('style');
  });
});
