import { describe, expect, it } from 'vitest';
import {
  composite,
  contrastRatio,
  discoverAccentNames,
  parseColor,
  resolveColorValue,
} from './contrast-test-utils';

describe('contrast test utilities', () => {
  it('computes the WCAG reference ratio for black on white', () => {
    expect(contrastRatio(parseColor('#000000'), parseColor('#ffffff'))).toBe(21);
  });

  it('composites each foreground channel over the matching background channel', () => {
    expect(composite([10, 10, 20], 0.5, [100, 200, 250])).toEqual([55, 105, 135]);
  });

  it('discovers every light accent selector without duplicating dark selectors', () => {
    const css = `
      html[data-accent='clay'] { --primary: #000000; }
      html[data-accent='clay'].dark { --primary: #ffffff; }
      html[data-accent='new-accent'] { --primary: #111111; }
      html[data-accent='new-accent'].theme-dark { --primary: #eeeeee; }
    `;

    expect(discoverAccentNames(css)).toEqual(['clay', 'new-accent']);
  });

  it('resolves token references through ordered CSS contexts', () => {
    const theme = '--foreground: var(--ivory-50);';
    const palette = '--ivory-50: #faf7f2;';

    expect(resolveColorValue('--foreground', theme, palette)).toEqual([250, 247, 242]);
  });
});
