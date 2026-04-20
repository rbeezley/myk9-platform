import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('podium.css', () => {
  let css: string;

  beforeAll(() => {
    css = fs.readFileSync(path.resolve(__dirname, '../podium.css'), 'utf-8');
  });

  it('uses Fraunces for celebration typography', () => {
    expect(css).toMatch(/font-family:\s*.*'Fraunces'/);
  });

  it('does not reference Playfair Display anywhere', () => {
    expect(css).not.toMatch(/Playfair\s*Display/i);
  });

  it('does not import Playfair Display from Google Fonts', () => {
    expect(css).not.toMatch(/family=Playfair/);
  });
});
