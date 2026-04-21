import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('index.css — Phase 3 regression (legacy accent blocks removed)', () => {
  let css: string;

  beforeAll(() => {
    css = fs.readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8');
  });

  it('canonical .accent-teal still defined with teal primary', () => {
    expect(css).toMatch(/:root\.accent-teal\s*\{[^}]*--primary:\s*#14b8a6/);
  });

  it('canonical .accent-terracotta still defined with terracotta primary', () => {
    expect(css).toMatch(/:root\.accent-terracotta\s*\{[^}]*--primary:\s*#c96442/);
  });

  it('canonical .accent-blue still defined', () => {
    expect(css).toMatch(/:root\.accent-blue\s*\{[^}]*--primary:\s*#3b82f6/);
  });

  it('canonical .accent-purple still defined', () => {
    expect(css).toMatch(/:root\.accent-purple\s*\{[^}]*--primary:\s*#8b5cf6/);
  });

  it('legacy .accent-green block removed', () => {
    expect(css).not.toMatch(/:root\.accent-green\s*\{/);
  });

  it('legacy .accent-orange block removed', () => {
    expect(css).not.toMatch(/:root\.accent-orange\s*\{/);
  });

  it('deprecation comment removed', () => {
    expect(css).not.toMatch(/legacy accent class aliases/i);
  });
});
