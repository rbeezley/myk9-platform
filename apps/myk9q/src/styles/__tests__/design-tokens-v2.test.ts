import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('apps/myk9q/src/styles/design-tokens.css', () => {
  let css: string;
  let rootBody: string;

  beforeAll(() => {
    css = fs.readFileSync(path.resolve(__dirname, '../design-tokens.css'), 'utf-8');
    const rootBlockMatch = css.match(/:root\s*\{([\s\S]*?)\n\}/);
    expect(rootBlockMatch).not.toBeNull();
    rootBody = rootBlockMatch![1];
  });

  it('does not redeclare v2 canvas (comes from @myk9/ui/styles)', () => {
    expect(rootBody).not.toMatch(/--background:\s*#F8F7F4/);
    expect(rootBody).not.toMatch(/--card:\s*#FEFDFB/);
  });

  it('does not redeclare the serif display font', () => {
    expect(css).not.toMatch(/--font-display:\s*'Playfair Display'/);
  });

  it('does not redeclare blurred-drop shadow tokens (ring shadows now canonical)', () => {
    expect(rootBody).not.toMatch(/--token-shadow-sm:\s*0 1px 3px/);
  });

  it('keeps ringside-specific status tokens', () => {
    expect(css).toMatch(/--status-checked-in:\s*#14b8a6/);
    expect(css).toMatch(/--status-pulled:/);
    expect(css).toMatch(/--status-in-ring:/);
  });

  it('keeps density classes', () => {
    expect(css).toMatch(/html\.density-compact/);
    expect(css).toMatch(/html\.density-comfortable/);
    expect(css).toMatch(/html\.density-spacious/);
  });

  it('replaces cool-charcoal dark canvas with warm olive-dark', () => {
    const darkBlockMatch = css.match(/\.theme-dark\s*\{([\s\S]*?)\n\}/);
    if (darkBlockMatch) {
      const darkBody = darkBlockMatch[1];
      expect(darkBody).not.toMatch(/--background:\s*#1a1a1e/);
    }
  });
});

// Cascade order guard — the whole v2 trim plan only works if @myk9/ui/styles
// is imported BEFORE ./styles/design-tokens.css in apps/myk9q/src/index.css.
// If a future refactor reverses the order, myK9Q's app-level literals would
// silently override the shared layer and v2 would regress without any test
// failing. Lock it down here.
describe('apps/myk9q/src/index.css cascade order', () => {
  it('imports @myk9/ui/styles before ./styles/design-tokens.css', () => {
    const indexCss = fs.readFileSync(path.resolve(__dirname, '../../index.css'), 'utf-8');
    const sharedImportIndex = indexCss.indexOf('@myk9/ui/styles');
    const appImportIndex = indexCss.indexOf('./styles/design-tokens.css');
    expect(sharedImportIndex).toBeGreaterThan(-1);
    expect(appImportIndex).toBeGreaterThan(-1);
    expect(sharedImportIndex).toBeLessThan(appImportIndex);
  });
});
