import { readdirSync, readFileSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, relative, resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { block, contrastRatio, resolveColorValue } from './contrast-test-utils';

/**
 * A control filled with `bg-primary` must take its label colour from
 * `--primary-foreground`, never a hardcoded white.
 *
 * White clears AA on every LIGHT-mode accent (5.4-5.8:1) — which is why this
 * survives review — and fails on every DARK-mode one: clay 3.12:1, grove
 * 2.90:1, dusk 3.64:1, heather 3.86:1, all under the 4.5:1 floor for a button
 * label. `--primary-foreground` is white in light and warm ink in dark, so the
 * token is correct in both and the hardcode is wrong in one.
 *
 * Shipped on five controls (both sign-in submits, sign-up, forgot-password,
 * reset-password, Add Dog, class-completion) before a sweep found them.
 *
 * Two independent guards, because each misses what the other catches:
 *  - the RATIO check is measured from the tokens, so a palette edit that
 *    reintroduces a failing pair fails even if no class name changes;
 *  - the SOURCE scan catches a new hardcode even though the tokens are fine.
 * A source scan alone would certify a no-op; a token check alone would not
 * notice a fresh `text-white`.
 */
const here = dirname(fileURLToPath(import.meta.url));
const appSrc = resolve(here, '..', '..');
const css = readFileSync(resolve(appSrc, 'index.css'), 'utf8');

const AA_SMALL_TEXT = 4.5;
const rootBlock = block(css, ':root');
const darkBlock = block(css, '.dark');

/** Every accent's `--primary` / `--primary-foreground` pair, per theme. */
function accentPairs(): Array<{ accent: string; mode: 'light' | 'dark'; css: string }> {
  const accents = new Set<string>(['clay']);
  for (const m of css.matchAll(/html\[data-accent='([^']+)'\]/g)) accents.add(m[1]);
  const pairs: Array<{ accent: string; mode: 'light' | 'dark'; css: string }> = [];
  for (const accent of accents) {
    for (const mode of ['light', 'dark'] as const) {
      // The default (clay) block is written as html:not([data-accent]).
      const selector =
        accent === 'clay'
          ? mode === 'dark'
            ? 'html:not([data-accent]).dark'
            : 'html:not([data-accent])'
          : mode === 'dark'
            ? `html[data-accent='${accent}'].dark`
            : `html[data-accent='${accent}']`;
      const at = css.indexOf(selector);
      if (at === -1) continue;
      pairs.push({ accent, mode, css: css.slice(at) });
    }
  }
  return pairs;
}

/** Every .ts/.tsx file under the app's src/. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (full.endsWith('.tsx') || full.endsWith('.ts')) out.push(full);
  }
  return out;
}

const CLASS_ATTR = /(?:className|class)\s*=\s*\{?\s*[`"']([^`"']{0,2000})[`"']/g;
const PRIMARY_FILL = /\bbg-primary(?:\/\d+)?\b/;
const WHITE_LABEL = /(?:^|[\s:])(?:dark:)?text-white\b/;

describe('bg-primary label contrast', () => {
  it('known-answer check: the ratio helper agrees on black-on-white', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1);
  });

  it.each(accentPairs())('$accent/$mode: --primary-foreground clears AA', ({ mode, css: ctx }) => {
    const themeBlock = mode === 'dark' ? darkBlock : rootBlock;
    const fill = resolveColorValue('--primary', ctx, themeBlock, css);
    const label = resolveColorValue('--primary-foreground', ctx, themeBlock, css);
    expect(contrastRatio(label, fill)).toBeGreaterThanOrEqual(AA_SMALL_TEXT);
  });

  it('white fails on every dark-mode accent — the reason the token exists', () => {
    const darks = accentPairs().filter(p => p.mode === 'dark');
    expect(darks.length).toBeGreaterThan(0);
    for (const { accent, css: ctx } of darks) {
      const fill = resolveColorValue('--primary', ctx, darkBlock, css);
      expect(contrastRatio([255, 255, 255], fill), `${accent} dark`).toBeLessThan(AA_SMALL_TEXT);
    }
  });

  it('no bg-primary control anywhere hardcodes a white label', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(appSrc)) {
      const source = readFileSync(file, 'utf8');
      for (const m of source.matchAll(CLASS_ATTR)) {
        const classes = m[1];
        if (PRIMARY_FILL.test(classes) && WHITE_LABEL.test(classes)) {
          const line = source.slice(0, m.index).split('\n').length;
          offenders.push(`${relative(appSrc, file)}:${line}`);
        }
      }
    }
    expect(offenders, 'use text-primary-foreground on a bg-primary control').toEqual([]);
  });
});
