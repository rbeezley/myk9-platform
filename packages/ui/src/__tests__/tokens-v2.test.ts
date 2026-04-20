import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('tokens-v2.css', () => {
  let css: string;

  beforeAll(() => {
    css = fs.readFileSync(path.resolve(__dirname, '../styles/tokens-v2.css'), 'utf-8');
  });

  it('defines v2 parchment canvas surfaces', () => {
    expect(css).toMatch(/--background:\s*#faf7f2/);
    expect(css).toMatch(/--background-alt:\s*#f3efe6/);
    expect(css).toMatch(/--card:\s*#ffffff/);
  });

  it('defines v2 warm-ink foreground', () => {
    expect(css).toMatch(/--foreground:\s*#181411/);
    expect(css).toMatch(/--card-foreground:\s*#141413/);
  });

  it('defines warm-cream border', () => {
    expect(css).toMatch(/--border:\s*#e4dccc/);
  });

  it('defines Fraunces as the serif display font', () => {
    expect(css).toMatch(/--font-serif:\s*'Fraunces'/);
  });

  it('keeps Montserrat as the sans body font', () => {
    expect(css).toMatch(/--font-sans:\s*'Montserrat'/);
  });

  it('defines ring shadows (0 0 0 1px ring + soft drop)', () => {
    expect(css).toMatch(/--token-shadow-sm:\s*0 0 0 1px rgba\(20, 20, 19, 0\.08\)/);
    expect(css).toMatch(/--token-shadow-md:\s*0 0 0 1px rgba\(20, 20, 19, 0\.08\),\s*0 2px 8px/);
  });

  it('defines warm-tone muted neutrals', () => {
    expect(css).toMatch(/--muted-foreground:\s*#8c8376/);
  });
});

describe('dark-v2.css', () => {
  let css: string;

  beforeAll(() => {
    css = fs.readFileSync(path.resolve(__dirname, '../styles/dark-v2.css'), 'utf-8');
  });

  it('scopes to .theme-dark', () => {
    expect(css).toMatch(/\.theme-dark\s*\{/);
  });

  it('uses warm olive-dark canvas (matches myK9Show live v2)', () => {
    expect(css).toMatch(/--background:\s*#181411/);
    expect(css).toMatch(/--card:\s*#1e1c19/);
  });

  it('uses warm-silver muted foreground (matches light mode per myK9Show)', () => {
    expect(css).toMatch(/--muted-foreground:\s*#8c8376/);
  });

  it('keeps teal primary accent in dark mode', () => {
    expect(css).toMatch(/--primary:\s*#14b8a6/);
  });
});

// Cascade-shadow guard — index.css imports tokens-v2.css/dark-v2.css, then
// declares its own :root and .dark blocks. Because CSS cascade resolves
// equal-specificity selectors by source order, any v2-owned token re-declared
// in index.css's :root would silently shadow the v2 value for every consumer
// (myK9Q imports @myk9/ui/styles directly). This test failed once in Phase 1
// when --background, --card, --border, etc. were left over from v1. Keep it
// so a future edit can't quietly reintroduce the shadow.
//
// Scoping note: .dark is myK9Show's shadcn convention; dark-v2.css scopes to
// .theme-dark (myK9Q). These are separate selectors today, but a future edit
// could add .theme-dark to the index.css .dark block (e.g. `.dark, .theme-dark`)
// or rename myK9Q to use .dark. Assert no v2-owned tokens appear in .dark so
// either change would trip the guard.
describe('index.css does not shadow v2 tokens', () => {
  let css: string;

  beforeAll(() => {
    css = fs.readFileSync(path.resolve(__dirname, '../styles/index.css'), 'utf-8');
  });

  const v2OwnedTokens = [
    '--background',
    '--background-alt',
    '--foreground',
    '--card',
    '--card-secondary',
    '--card-foreground',
    '--muted',
    '--muted-foreground',
    '--border',
    '--surface',
  ];

  describe(':root block', () => {
    let rootBody: string;

    beforeAll(() => {
      const rootMatch = css.match(/:root\s*\{([\s\S]*?)\n\}/);
      expect(rootMatch).not.toBeNull();
      rootBody = rootMatch![1];
    });

    for (const token of v2OwnedTokens) {
      it(`does not redeclare ${token}`, () => {
        const pattern = new RegExp(`^\\s*${token}\\s*:`, 'm');
        expect(rootBody).not.toMatch(pattern);
      });
    }
  });

  describe('.dark block', () => {
    let darkBody: string;

    beforeAll(() => {
      const darkMatch = css.match(/\.dark\s*\{([\s\S]*?)\n\}/);
      expect(darkMatch).not.toBeNull();
      darkBody = darkMatch![1];
    });

    for (const token of v2OwnedTokens) {
      it(`does not redeclare ${token}`, () => {
        const pattern = new RegExp(`^\\s*${token}\\s*:`, 'm');
        expect(darkBody).not.toMatch(pattern);
      });
    }
  });
});
