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
