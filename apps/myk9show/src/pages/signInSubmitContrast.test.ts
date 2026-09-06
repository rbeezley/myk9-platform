import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  block,
  contrastRatio,
  resolveColorValue,
} from '@/styles/__tests__/contrast-test-utils';

/**
 * The sign-in submit buttons must take their label colour from
 * --primary-foreground, never a hardcoded white.
 *
 * White on the DARK-mode clay primary (#d97757) measures 3.12:1 — below the
 * 4.5:1 AA floor for the 15px/600 label — which is exactly why
 * --primary-foreground is warm ink (#181411) in dark and white in light. Both
 * buttons shipped `text-white`, so dark mode failed while the token that would
 * have been correct sat unused two files away.
 *
 * Measured, not asserted from the literal: a token edit that reintroduces a
 * failing pair fails here even if the class names stay put.
 */
const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, '..', 'index.css'), 'utf8');
const smartSignIn = readFileSync(resolve(here, 'SmartSignInPage.tsx'), 'utf8');
const passwordSubForm = readFileSync(resolve(here, 'PasswordSubForm.tsx'), 'utf8');

const AA_SMALL_TEXT = 4.5;
const rootBlock = block(css, ':root');
const darkBlock = block(css, '.dark');
// The default clay accent supplies --primary; :root/.dark supply the rest.
const clayLight = css.slice(css.indexOf("html:not([data-accent])"));
const clayDark = css.slice(css.indexOf("html:not([data-accent]).dark"));

describe('sign-in submit button contrast', () => {
  it('known-answer check: the ratio helper agrees on black-on-white', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1);
  });

  it('dark-mode primary-foreground on primary clears AA (white would not)', () => {
    const fill = resolveColorValue('--primary', clayDark, darkBlock, css);
    const label = resolveColorValue('--primary-foreground', clayDark, darkBlock, css);
    expect(contrastRatio(label, fill)).toBeGreaterThanOrEqual(AA_SMALL_TEXT);
    // The regression this guards: the value the buttons used to hardcode.
    expect(contrastRatio([255, 255, 255], fill)).toBeLessThan(AA_SMALL_TEXT);
  });

  it('light-mode primary-foreground on primary clears AA', () => {
    const fill = resolveColorValue('--primary', clayLight, rootBlock, css);
    const label = resolveColorValue('--primary-foreground', clayLight, rootBlock, css);
    expect(contrastRatio(label, fill)).toBeGreaterThanOrEqual(AA_SMALL_TEXT);
  });

  it('both submit buttons take the label colour from the token', () => {
    for (const [name, source] of [
      ['SmartSignInPage', smartSignIn],
      ['PasswordSubForm', passwordSubForm],
    ] as const) {
      const submits = source.match(/bg-primary[^"']*/g) ?? [];
      expect(submits.length, `${name} has no bg-primary control`).toBeGreaterThan(0);
      for (const cls of submits) {
        expect(cls, `${name}: bg-primary control must not hardcode white`).not.toMatch(
          /text-white/
        );
        expect(cls, `${name}: bg-primary control needs text-primary-foreground`).toMatch(
          /text-primary-foreground/
        );
      }
    }
  });
});
