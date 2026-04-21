import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('index.css — accent class rename', () => {
  let css: string;

  beforeAll(() => {
    css = fs.readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8');
  });

  it('defines canonical .accent-teal with teal primary', () => {
    expect(css).toMatch(/:root\.accent-teal\s*\{[^}]*--primary:\s*#14b8a6/);
  });

  it('defines canonical .accent-terracotta with terracotta primary', () => {
    expect(css).toMatch(/:root\.accent-terracotta\s*\{[^}]*--primary:\s*#c96442/);
  });

  it('keeps .accent-green as deprecation alias of teal', () => {
    const greenBlock = css.match(/:root\.accent-green\s*\{([^}]*)\}/);
    expect(greenBlock).not.toBeNull();
    expect(greenBlock![1]).toMatch(/--primary:\s*#14b8a6/);
  });

  it('keeps .accent-orange as deprecation alias of terracotta', () => {
    const orangeBlock = css.match(/:root\.accent-orange\s*\{([^}]*)\}/);
    expect(orangeBlock).not.toBeNull();
    expect(orangeBlock![1]).toMatch(/--primary:\s*#c96442/);
  });

  it('keeps .accent-blue unchanged', () => {
    expect(css).toMatch(/:root\.accent-blue\s*\{[^}]*--primary:\s*#3b82f6/);
  });

  it('keeps .accent-purple unchanged', () => {
    expect(css).toMatch(/:root\.accent-purple\s*\{[^}]*--primary:\s*#8b5cf6/);
  });
});
