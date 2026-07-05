import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const cssPath = path.resolve(__dirname, '../myk9-show-details.css');

describe('My Entries responsive source guards', () => {
  it('keeps tablet class rows from squeezing labels and result actions together', () => {
    const css = fs.readFileSync(cssPath, 'utf8');

    expect(css).toMatch(/\.myk9-entries-class-row\s*{[\s\S]*min-width: 0;/);
    expect(css).toMatch(/\.myk9-entries-class-name\s*{[\s\S]*text-overflow: ellipsis;/);
    expect(css).toMatch(
      /@media \(max-width: 768px\)[\s\S]*\.myk9-entries-class-row\s*{[\s\S]*flex-direction: column;/
    );
  });
});
