import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the My Shows surface against a silent, compile-clean styling bug.
 *
 * Tailwind cannot apply an opacity modifier to a colour declared as a bare
 * `var(--x)`. `tailwind.config.js` declares most of this design system that way
 * (`primary: { DEFAULT: 'var(--primary)' }`), because the tokens hold hex values
 * that thousands of lines of hand-written CSS consume directly. The consequence:
 * `bg-muted/50` emits NO CSS at all. It does not warn, it does not fall back to
 * `bg-muted` — the utility simply does not exist, and the element renders
 * unpainted.
 *
 * Only two kinds of opacity-modified class actually paint:
 *   1. tokens declared `rgb(var(--x) / <alpha-value>)` (success, warning,
 *      destructive, info), which Tailwind can compose natively; and
 *   2. exact classes someone wrote out by hand with `color-mix()` in
 *      `index.css` — a hand-maintained allowlist, not a rule.
 *
 * Because the broken form is indistinguishable from the working form at the call
 * site, 25 of them accumulated on this page over roughly a year: invisible
 * loading skeletons, eleven controls with no hover feedback, and a header
 * "gradient" that never rendered. This test is the feedback loop that was
 * missing. If it fails, the class you added is inert — use an unmodified token,
 * pick a token that supports alpha, or add the exact class to index.css.
 */

const SRC = resolve(__dirname, '../../..');
const APP = resolve(SRC, '..');

/** Every .tsx the My Shows page owns or is the sole consumer of. */
const PAGE_FILES = [
  'pages/MyEntriesPage/index.tsx',
  ...readdirSync(resolve(SRC, 'pages/MyEntriesPage/modules'))
    .filter(f => f.endsWith('.tsx') && !f.includes('.test.'))
    .map(f => `pages/MyEntriesPage/modules/${f}`),
  'components/exhibitor/CompactStatsRow.tsx',
  'components/exhibitor/DogStrip.tsx',
  'components/exhibitor/DogStripCard.tsx',
  'components/exhibitor/FirstRunZeroState.tsx',
  'features/show-today/ShowTodayBanner.tsx',
];

const OPACITY_CLASS =
  /(?:[a-z-]+:)*(?:bg|text|border|ring|from|via|to|fill|stroke|divide|shadow|outline)-[a-z][a-z0-9-]*\/\d{1,3}/g;

/** Token names Tailwind can compose an alpha channel onto. */
const alphaCapableTokens = (): Set<string> => {
  const config = readFileSync(resolve(APP, 'tailwind.config.js'), 'utf8');
  const names = new Set<string>();
  // e.g.  success: { DEFAULT: 'rgb(var(--success) / <alpha-value>)', ... }
  for (const m of config.matchAll(/([a-z][a-z0-9-]*)\s*:\s*\{[^}]*?<alpha-value>/gs)) {
    names.add(m[1] as string);
  }
  for (const m of config.matchAll(
    /([a-z][a-z0-9-]*)\s*:\s*'rgb\(var\([^)]*\)\s*\/\s*<alpha-value>\)'/g
  )) {
    names.add(m[1] as string);
  }
  return names;
};

/** Exact classes hand-written with color-mix() in index.css. */
const handWrittenUtilities = (): Set<string> => {
  const css = readFileSync(resolve(SRC, 'index.css'), 'utf8');
  const found = new Set<string>();
  for (const m of css.matchAll(/\.((?:[a-z-]+\\:)*[a-z][a-z0-9-]*\\\/\d{1,3})/g)) {
    found.add((m[1] as string).replace(/\\/g, ''));
  }
  return found;
};

/** The bare token a class targets: `hover:bg-muted/50` -> `muted`. */
const tokenOf = (cls: string): string => {
  const withoutVariants = cls.slice(cls.lastIndexOf(':') + 1);
  const withoutOpacity = withoutVariants.slice(0, withoutVariants.lastIndexOf('/'));
  return withoutOpacity.replace(
    /^(bg|text|border|ring|from|via|to|fill|stroke|divide|shadow|outline)-/,
    ''
  );
};

describe('My Shows opacity modifiers must actually compile', () => {
  const alphaCapable = alphaCapableTokens();
  const handWritten = handWrittenUtilities();

  it('recognises the tokens that support alpha natively', () => {
    // Sanity-check the parser itself — if this regresses to an empty set the
    // contract below would pass vacuously.
    expect(alphaCapable.has('success')).toBe(true);
    expect(alphaCapable.has('warning')).toBe(true);
    expect(alphaCapable.size).toBeGreaterThanOrEqual(2);
  });

  it('finds the hand-written color-mix allowlist in index.css', () => {
    expect(handWritten.has('bg-primary/10')).toBe(true);
  });

  it.each(PAGE_FILES)('%s uses no inert opacity modifier', file => {
    const source = readFileSync(resolve(SRC, file), 'utf8');
    // Comments explain the trap by name; only real className values count.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    const inert = [...new Set(code.match(OPACITY_CLASS) ?? [])].filter(cls => {
      const token = tokenOf(cls);
      if (alphaCapable.has(token)) return false;
      if (handWritten.has(cls.slice(cls.lastIndexOf(':') + 1))) return false;
      // A literal Tailwind palette colour (emerald-500) carries its own value
      // and composes alpha fine. It is banned here for a different reason —
      // see the raw-palette test below — so it is not an *inert* class.
      if (/-\d{2,3}$/.test(token)) return false;
      return true;
    });

    expect(inert).toEqual([]);
  });

  it.each(PAGE_FILES)('%s uses no raw Tailwind palette colour', file => {
    const source = readFileSync(resolve(SRC, file), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // Raw palette colours are cool-toned and theme-blind; the system's warm
    // semantic tokens carry a distinct light and dark value. This is the
    // ShowStatusPill bug (PR #666) and the emerald/success clash on the
    // show-day banner, both of which shipped.
    const raw =
      /\b(?:bg|text|border|ring|from|via|to|divide)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g;
    expect([...new Set(code.match(raw) ?? [])]).toEqual([]);
  });
});
