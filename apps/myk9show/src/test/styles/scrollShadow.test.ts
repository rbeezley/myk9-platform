/**
 * Regression guard for the dog-rail scroll affordance (exhibitor-ux-remediation
 * 6.2, dark-mode follow-up). The `.scroll-shadow-x` edge-fade must derive its
 * shadow color from the theme-aware `--scroll-shadow-tint` variable, not a
 * hardcoded near-black rgba — a fixed dark shadow is invisible against the
 * near-black dark-theme background (`--background: var(--ink-900)`), which
 * silently removed the scroll cue for dark-mode touch users.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// src/test/styles → src/index.css
const css = readFileSync(join(__dirname, '..', '..', 'index.css'), 'utf-8');

// Isolate a CSS block by its selector so we assert against the right scope.
function block(selector: string): string {
  const start = css.indexOf(selector + ' {');
  expect(start, `expected to find "${selector} {" in index.css`).toBeGreaterThan(-1);
  const open = css.indexOf('{', start);
  const end = css.indexOf('}', open);
  return css.slice(open, end);
}

describe('index.css — scroll-shadow-x is theme-aware', () => {
  it('drives the shadow color from the --scroll-shadow-tint variable, not a hardcoded rgba', () => {
    const rule = block('.scroll-shadow-x');
    // The radial "shadow" gradients must use the variable.
    expect(rule).toContain('var(--scroll-shadow-tint)');
    // And must NOT repin the old hardcoded near-black shadow.
    expect(rule).not.toContain('rgba(28, 24, 21, 0.16)');
  });

  it('defines a dark shadow tint for the light theme', () => {
    // index.css has several :root blocks; assert the light-theme declaration
    // exists in the file (the .dark test below proves the dark override).
    expect(css).toContain('--scroll-shadow-tint: rgba(28, 24, 21, 0.16)');
  });

  it('defines a distinct light shadow tint in the dark theme (.dark)', () => {
    const dark = block('.dark');
    expect(dark).toContain('--scroll-shadow-tint:');
    // Dark theme must NOT reuse the near-black light-theme value.
    expect(dark).not.toContain('--scroll-shadow-tint: rgba(28, 24, 21, 0.16)');
  });
});
