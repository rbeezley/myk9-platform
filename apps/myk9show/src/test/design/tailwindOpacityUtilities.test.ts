/**
 * Production-build contract for opacity-modified semantic colour utilities.
 *
 * Tailwind silently drops an opacity modifier when its colour value is a bare
 * CSS variable (`bg-muted/30` is absent from the generated stylesheet). This
 * test runs the real Tailwind/PostCSS pipeline against every CSS-variable
 * colour in the app config and checks representative background, text,
 * border, ring, shadow, and gradient utilities. A future token that regresses
 * to a bare `var(--token)` therefore fails here instead of shipping an
 * invisible state.
 */
import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import type { Config } from 'tailwindcss/types/config';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const OPACITY = 30;
const COLOR_UTILITIES = ['bg', 'text', 'border', 'ring', 'shadow', 'from', 'via', 'to'] as const;

type ColorEntry = { name: string; value: string };

function cssVariableColors(value: unknown, prefix = ''): ColorEntry[] {
  if (typeof value === 'string') {
    return value.includes('var(--') && value.includes('<alpha-value>')
      ? [{ name: prefix, value }]
      : [];
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];

  return Object.entries(value).flatMap(([key, child]) => {
    const name = key === 'DEFAULT' ? prefix : prefix ? `${prefix}-${key}` : key;
    return cssVariableColors(child, name);
  });
}

function escapeClassName(className: string): string {
  return className.replace(/([\\/:.[\]#%!()])/g, '\\$1');
}

describe('Tailwind CSS-variable colours support opacity modifiers', () => {
  it('emits every configured semantic colour utility in the production pipeline', async () => {
    const tailwindConfig = (await import(`${APP_ROOT}/tailwind.config.js`)).default as Config;
    const colors = cssVariableColors(tailwindConfig.theme?.extend?.colors);
    expect(colors.length, 'no alpha-capable CSS-variable colours were found').toBeGreaterThan(0);

    const utilities = colors.flatMap(({ name }) =>
      COLOR_UTILITIES.map(utility => `${utility}-${name}/${OPACITY}`)
    );
    const { css } = await postcss([
      tailwindcss({
        ...tailwindConfig,
        content: [{ raw: utilities.join(' '), extension: 'html' }],
        corePlugins: { preflight: false },
      }),
    ]).process('@tailwind utilities;', { from: undefined });

    const missing = utilities.filter(utility => !css.includes(`.${escapeClassName(utility)}`));
    expect(missing, 'opacity utility was silently dropped from generated CSS').toEqual([]);
  });

  it('keeps the known load-bearing table states emitted', async () => {
    const utilities = ['bg-muted/30', 'hover:bg-muted/20', 'border-border/50', 'bg-card/95'];
    const tailwindConfig = (await import(`${APP_ROOT}/tailwind.config.js`)).default as Config;
    const { css } = await postcss([
      tailwindcss({
        ...tailwindConfig,
        content: [{ raw: utilities.join(' '), extension: 'html' }],
        corePlugins: { preflight: false },
      }),
    ]).process('@tailwind utilities;', { from: undefined });

    const missing = utilities.filter(
      utility => !css.includes(`.${escapeClassName(utility).replace(/\\:/g, '\\:')}`)
    );
    expect(missing).toEqual([]);
  });
});
