import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = process.cwd();
const AA_SMALL_TEXT = 4.5;

function read(relPath: string): string {
  return readFileSync(join(appRoot, relPath), 'utf8');
}

function parseRgbTriplet(value: string): [number, number, number] {
  const parts = value.trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) {
    throw new Error(`Expected RGB triplet, got "${value}"`);
  }
  return [parts[0], parts[1], parts[2]];
}

function parseHex(value: string): [number, number, number] {
  const hex = value.trim().replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    throw new Error(`Expected hex color, got "${value}"`);
  }
  return [0, 2, 4].map(index => Number.parseInt(hex.slice(index, index + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function parseColor(value: string): [number, number, number] {
  return value.trim().startsWith('#') ? parseHex(value) : parseRgbTriplet(value);
}

function luminance(color: [number, number, number]): number {
  const [r, g, b] = color.map(channel => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(
  first: [number, number, number],
  second: [number, number, number]
): number {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function mixWithWhite(color: [number, number, number], alpha: number): [number, number, number] {
  return color.map(channel => Math.round(channel * alpha + 255 * (1 - alpha))) as [
    number,
    number,
    number,
  ];
}

function varValue(css: string, name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`Missing ${name}`);
  return match[1].trim();
}

function block(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`[^{}]*${escaped}[^{}]*\\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`Missing block for ${selector}`);
  return match[1];
}

describe('semantic token contrast', () => {
  const indexCss = read('src/index.css');
  const redesignTokens = read('src/styles/redesign-tokens.css');
  const darkBlock = indexCss.slice(indexCss.indexOf('.dark {'));
  const chipLightBlock = block(redesignTokens, ':root');
  const chipDarkBlock = block(redesignTokens, '.dark');

  it.each(['--success', '--warning', '--info'])(
    'keeps light %s tint text at AA contrast',
    token => {
      const color = parseRgbTriplet(varValue(indexCss, token));
      const tintedSurface = mixWithWhite(color, 0.1);
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
