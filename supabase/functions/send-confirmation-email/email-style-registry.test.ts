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

  it('routes headline to the Headline builder and all other styles through Heritage fallback', () => {
    for (const style of EMAIL_STYLES) {
      expect(selectEmailBuilderKey(style)).toBe(style === 'headline' ? 'headline' : 'heritage');
    }
  });

  it('normalizes legacy and unknown style values safely', () => {
    expect(resolveEmailStyle('default')).toBe('monogram');
    expect(resolveEmailStyle('fieldGuide')).toBe('fieldGuide');
    expect(resolveEmailStyle('unknown')).toBe('monogram');
    expect(resolveEmailStyle(null)).toBe('monogram');
  });
});
