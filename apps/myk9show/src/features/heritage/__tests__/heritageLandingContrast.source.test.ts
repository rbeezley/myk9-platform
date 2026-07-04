import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = process.cwd();

function read(relPath: string): string {
  return readFileSync(join(appRoot, relPath), 'utf8');
}

describe('heritage landing contrast source guards', () => {
  it('uses the dark-surface gold token for gold ornaments on ink bands', () => {
    const css = read('src/features/heritage/heritage.css');

    expect(css).toContain('[data-heritage] .hl-on-ink .hl-rule-orn.gold');
    expect(css).toContain('color: var(--hl-gold-on-dark)');
    expect(css).toContain('background: var(--hl-gold-on-dark)');
  });

  it('documents the fixed-light public surface intent at the landing root', () => {
    const source = read('src/features/heritage/landing/HeritageLandingPage.tsx');

    expect(source).toContain('INTENT: Heritage is a deliberately fixed-light public style');
    expect(source).toContain('data-heritage');
    expect(source).toContain("background: 'var(--hl-paper)'");
  });
});
