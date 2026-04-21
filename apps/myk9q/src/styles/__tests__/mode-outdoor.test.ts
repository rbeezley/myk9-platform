import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('mode-outdoor.css', () => {
  let css: string;

  beforeAll(() => {
    css = fs.readFileSync(path.resolve(__dirname, '../mode-outdoor.css'), 'utf-8');
  });

  it('scopes all overrides to html.mode-outdoor', () => {
    // Every rule block in this file must be prefixed with html.mode-outdoor.
    const ruleStarts = css.match(/^\s*[^@/\s].*\{/gm) || [];
    for (const rule of ruleStarts) {
      expect(rule).toMatch(/html\.mode-outdoor/);
    }
  });

  it('uses pure-white canvas and card for maximum contrast', () => {
    expect(css).toMatch(/--background:\s*#ffffff/);
    expect(css).toMatch(/--card:\s*#ffffff/);
  });

  it('uses pure-black foreground for maximum contrast', () => {
    expect(css).toMatch(/--foreground:\s*#000000/);
  });

  it('thickens borders to 2px ring shadows', () => {
    expect(css).toMatch(/--token-shadow-sm:\s*0 0 0 2px/);
    expect(css).toMatch(/--token-shadow-md:\s*0 0 0 2px/);
    expect(css).toMatch(/--token-shadow-lg:\s*0 0 0 2px/);
  });

  it('uses darker teal primary (#0f766e) for AA contrast on white', () => {
    expect(css).toMatch(/--primary:\s*#0f766e/);
  });

  it('strengthens border color', () => {
    // --border must be a darker-than-default gray for visibility.
    expect(css).toMatch(/--border:\s*#9ca3af/);
    expect(css).toMatch(/--border-strong:\s*#4a5568/);
  });
});

describe('index.css — imports mode-outdoor', () => {
  it('imports mode-outdoor.css', () => {
    const indexCss = fs.readFileSync(path.resolve(__dirname, '../../index.css'), 'utf-8');
    expect(indexCss).toMatch(/@import\s+['"]\.\/styles\/mode-outdoor\.css['"]/);
  });
});
