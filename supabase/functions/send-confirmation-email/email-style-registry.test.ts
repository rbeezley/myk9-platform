import { describe, expect, it } from 'vitest';
import { EMAIL_STYLES, resolveEmailStyle, selectEmailBuilderKey } from './email-style-registry';

describe('confirmation email style registry', () => {
  it('knows every current premium style', () => {
    expect(EMAIL_STYLES).toEqual([
      'monogram',
      'banner',
      'headline',
      'magazine',
      'poster',
      'gazette',
      'fieldGuide',
      'heritage',
    ]);
  });

  it('routes each style to its own dedicated builder (8-way dispatch)', () => {
    // All eight styles now have dedicated builders — Heritage is no
    // longer the catch-all fallback. Any future style added without a
    // builder must explicitly map to one (or extend this dispatch).
    expect(selectEmailBuilderKey('heritage')).toBe('heritage');
    expect(selectEmailBuilderKey('headline')).toBe('headline');
    expect(selectEmailBuilderKey('monogram')).toBe('monogram');
    expect(selectEmailBuilderKey('banner')).toBe('banner');
    expect(selectEmailBuilderKey('fieldGuide')).toBe('fieldGuide');
    expect(selectEmailBuilderKey('gazette')).toBe('gazette');
    expect(selectEmailBuilderKey('magazine')).toBe('magazine');
    expect(selectEmailBuilderKey('poster')).toBe('poster');
  });

  it('normalizes legacy and unknown style values safely', () => {
    expect(resolveEmailStyle('default')).toBe('monogram');
    expect(resolveEmailStyle('fieldGuide')).toBe('fieldGuide');
    expect(resolveEmailStyle('unknown')).toBe('monogram');
    expect(resolveEmailStyle(null)).toBe('monogram');
  });
});
