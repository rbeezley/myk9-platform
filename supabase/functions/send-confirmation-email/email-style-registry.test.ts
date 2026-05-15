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

  it('routes each style to its assigned builder (3-way dispatch)', () => {
    // Headline + Monogram have dedicated builders; magazine/poster/gazette/
    // fieldGuide currently fall back to Heritage until their own builders
    // ship. Banner is mapped to Monogram because its visual register sits
    // closer to Monogram than to Heritage.
    expect(selectEmailBuilderKey('headline')).toBe('headline');
    expect(selectEmailBuilderKey('monogram')).toBe('monogram');
    expect(selectEmailBuilderKey('banner')).toBe('monogram');
    expect(selectEmailBuilderKey('heritage')).toBe('heritage');
    expect(selectEmailBuilderKey('magazine')).toBe('heritage');
    expect(selectEmailBuilderKey('poster')).toBe('heritage');
    expect(selectEmailBuilderKey('gazette')).toBe('heritage');
    expect(selectEmailBuilderKey('fieldGuide')).toBe('heritage');
  });

  it('normalizes legacy and unknown style values safely', () => {
    expect(resolveEmailStyle('default')).toBe('monogram');
    expect(resolveEmailStyle('fieldGuide')).toBe('fieldGuide');
    expect(resolveEmailStyle('unknown')).toBe('monogram');
    expect(resolveEmailStyle(null)).toBe('monogram');
  });
});
