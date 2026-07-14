import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  block,
  composite,
  contrastRatio,
  discoverAccentNames,
  parseColor,
  parseHex,
  parseRgbTriplet,
  resolveColorValue,
  type RgbColor,
  varValue,
} from './contrast-test-utils';

const appRoot = process.cwd();
const AA_SMALL_TEXT = 4.5;
const AA_UI_COMPONENT = 3;

function read(relPath: string): string {
  return readFileSync(join(appRoot, relPath), 'utf8');
}

describe('semantic token contrast', () => {
  const indexCss = read('src/index.css');
  const redesignTokens = read('src/styles/redesign-tokens.css');
  const paletteTokens = read('src/pages/scoring/styles/design-tokens.css');
  const darkBlock = indexCss.slice(indexCss.indexOf('.dark {'));
  const chipLightBlock = block(redesignTokens, ':root');
  const chipDarkBlock = block(redesignTokens, '.dark');

  function expectContrast(label: string, foreground: RgbColor, background: RgbColor, minimum = 4.5) {
    expect(contrastRatio(foreground, background), label).toBeGreaterThanOrEqual(minimum);
  }

  function recordContrastFailure(
    failures: string[],
    label: string,
    foreground: RgbColor,
    background: RgbColor,
    minimum = 4.5
  ) {
    const ratio = contrastRatio(foreground, background);
    if (ratio < minimum) failures.push(`${label}: ${ratio.toFixed(2)}:1 (needs ${minimum}:1)`);
  }

  const semanticPairs = [
    ['--foreground', '--background'],
    ['--card-foreground', '--card'],
    ['--popover-foreground', '--popover'],
    ['--sidebar-foreground', '--sidebar'],
    ['--card-secondary-foreground', '--card-secondary'],
    ['--secondary-foreground', '--secondary'],
    ['--muted-foreground', '--muted'],
  ] as const;

  it.each([
    { theme: 'light', themeCss: indexCss },
    { theme: 'dark', themeCss: darkBlock },
  ])('keeps every core semantic pair readable in $theme mode', ({ theme, themeCss }) => {
    for (const [foregroundToken, backgroundToken] of semanticPairs) {
      const foreground = resolveColorValue(foregroundToken, themeCss, indexCss, paletteTokens);
      const background = resolveColorValue(backgroundToken, themeCss, indexCss, paletteTokens);
      expectContrast(`${theme} ${foregroundToken} on ${backgroundToken}`, foreground, background);
    }
  });

  const statusPairs = [
    ['success', '--success', '--success', '--success-foreground'],
    ['warning', '--warning', '--warning', '--warning-foreground'],
    ['info', '--info-strong', '--info', '--info-foreground'],
    ['destructive', '--destructive', '--destructive', '--destructive-foreground'],
  ] as const;

  it.each([
    { theme: 'light', themeCss: indexCss },
    { theme: 'dark', themeCss: darkBlock },
  ])('keeps semantic status fills and 10% tints readable in $theme mode', ({ theme, themeCss }) => {
    const failures: string[] = [];
    const surfaces = ['--background', '--card'] as const;
    for (const [label, tintTextToken, fillToken, fillForegroundToken] of statusPairs) {
      const fill = resolveColorValue(fillToken, themeCss, indexCss, paletteTokens);
      const fillForeground = resolveColorValue(
        fillForegroundToken,
        themeCss,
        indexCss,
        paletteTokens
      );
      recordContrastFailure(failures, `${theme} solid ${label}`, fillForeground, fill);

      const tintText = resolveColorValue(tintTextToken, themeCss, indexCss, paletteTokens);
      for (const surfaceToken of surfaces) {
        const surface = resolveColorValue(surfaceToken, themeCss, indexCss, paletteTokens);
        recordContrastFailure(
          failures,
          `${theme} ${label} 10% tint on ${surfaceToken}`,
          tintText,
          composite(fill, 0.1, surface)
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it('discovers and verifies every accent in light and dark mode', () => {
    const accentNames = discoverAccentNames(indexCss);
    expect(accentNames.length).toBeGreaterThan(0);
    const failures: string[] = [];

    for (const accent of accentNames) {
      const lightAccent = block(indexCss, `html[data-accent='${accent}']`);
      const darkAccent = block(indexCss, `html[data-accent='${accent}'].dark`);

      for (const [theme, accentCss, themeCss] of [
        ['light', lightAccent, indexCss],
        ['dark', darkAccent, darkBlock],
      ] as const) {
        const contexts = [accentCss, themeCss, indexCss, paletteTokens];
        const primary = resolveColorValue('--primary', ...contexts);
        const primaryHover = resolveColorValue('--primary-hover', ...contexts);
        const primaryForeground = resolveColorValue('--primary-foreground', ...contexts);
        const background = resolveColorValue('--background', ...contexts);
        const accentFill = resolveColorValue('--accent', ...contexts);
        const accentForeground = resolveColorValue('--accent-foreground', ...contexts);
        const ring = resolveColorValue('--ring', ...contexts);

        recordContrastFailure(failures, `${theme} ${accent} primary fill`, primaryForeground, primary);
        recordContrastFailure(
          failures,
          `${theme} ${accent} primary hover fill`,
          primaryForeground,
          primaryHover
        );
        recordContrastFailure(failures, `${theme} ${accent} primary text`, primary, background);
        recordContrastFailure(failures, `${theme} ${accent} accent pair`, accentForeground, accentFill);
        recordContrastFailure(
          failures,
          `${theme} ${accent} focus ring`,
          ring,
          background,
          AA_UI_COMPONENT
        );

        if (theme === 'light') {
          const tint = resolveColorValue('--primary-tint', ...contexts);
          const tintInk = resolveColorValue('--primary-tint-ink', ...contexts);
          recordContrastFailure(failures, `${theme} ${accent} tint pair`, tintInk, tint);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it.each(['--success', '--warning', '--info'])(
    'keeps light %s tint text at AA contrast',
    token => {
      const color = parseRgbTriplet(varValue(indexCss, token));
      const tintedSurface = composite(color, 0.1, [255, 255, 255]);
      expect(contrastRatio(color, tintedSurface)).toBeGreaterThanOrEqual(AA_SMALL_TEXT);
    }
  );

  it.each([
    ['warning', '--warning', '--warning-foreground'],
    ['info', '--info', '--info-foreground'],
  ])('keeps dark solid %s fills readable', (_label, bgToken, fgToken) => {
    const bg = parseRgbTriplet(varValue(darkBlock, bgToken));
    const fg = parseRgbTriplet(varValue(darkBlock, fgToken));
    expect(contrastRatio(bg, fg)).toBeGreaterThanOrEqual(AA_SMALL_TEXT);
  });

  it.each(['clay', 'grove', 'dusk', 'heather'])(
    'keeps dark %s primary fills readable',
    accent => {
      const accentBlock = block(indexCss, `html[data-accent='${accent}'].dark`);
      const bg = parseColor(varValue(accentBlock, '--primary'));
      const fg = parseColor(varValue(accentBlock, '--primary-foreground'));
      expect(contrastRatio(bg, fg)).toBeGreaterThanOrEqual(AA_SMALL_TEXT);
    }
  );

  it('keeps muted text readable in light and dark mode', () => {
    const lightBg = parseColor(varValue(indexCss, '--muted'));
    const lightFg = parseColor(varValue(indexCss, '--muted-foreground'));
    const darkBg = parseColor(varValue(darkBlock, '--muted'));
    const darkFg = parseColor('#8c8376');

    expect(contrastRatio(lightBg, lightFg)).toBeGreaterThanOrEqual(AA_SMALL_TEXT);
    expect(contrastRatio(darkBg, darkFg)).toBeGreaterThanOrEqual(AA_SMALL_TEXT);
  });

  it.each(['green', 'amber', 'red', 'blue', 'purple', 'teal', 'stone'])(
    'keeps %s chip pairs readable in light and dark mode',
    color => {
      const lightBg = parseHex(varValue(chipLightBlock, `--chip-${color}-bg`));
      const lightFg = parseHex(varValue(chipLightBlock, `--chip-${color}-fg`));
      const darkBg = parseHex(varValue(chipDarkBlock, `--chip-${color}-bg`));
      const darkFg = parseHex(varValue(chipDarkBlock, `--chip-${color}-fg`));

      expect(contrastRatio(lightBg, lightFg)).toBeGreaterThanOrEqual(AA_SMALL_TEXT);
      expect(contrastRatio(darkBg, darkFg)).toBeGreaterThanOrEqual(AA_SMALL_TEXT);
    }
  );
});
