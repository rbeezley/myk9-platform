import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Guards --success against reverting to green-700 (21 128 61).
 *
 * green-700 passes on plain white (~5.1:1) but fails the pervasive
 * `bg-success/10 text-success` tinted-badge pattern (~4.2:1, below the
 * 4.5:1 WCAG AA small-text threshold). green-800 (22 101 52) clears
 * the tinted pattern at ~5.2:1.
 *
 * Also guards the dark-mode --success-foreground: green-400 bg with white
 * foreground is only ~1.75:1; green-900 (20 83 45) reaches ~5.2:1.
 */
const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'index.css');
const css = readFileSync(cssPath, 'utf8');

describe('--success token WCAG AA', () => {
  it('light-mode --success is green-800 (22 101 52), not green-700 (21 128 61)', () => {
    expect(css).toContain('--success: 22 101 52');
    expect(css).not.toContain('--success: 21 128 61');
  });

  it('dark-mode --success-foreground is green-900 (20 83 45), not white', () => {
    const darkBlock = css.slice(css.indexOf('.dark {'));
    expect(darkBlock).toContain('--success-foreground: 20 83 45');
  });
});
