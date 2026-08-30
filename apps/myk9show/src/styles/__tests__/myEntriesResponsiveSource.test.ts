import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const cssPath = path.resolve(__dirname, '../myk9-show-details.css');

describe('My Entries responsive source guards', () => {
  it('keeps tablet class rows from squeezing labels and result actions together', () => {
    const css = fs.readFileSync(cssPath, 'utf8');

    expect(css).toMatch(/\.myk9-entries-class-row\s*{[\s\S]*min-width: 0;/);
    // The row protects itself by WRAPPING a long class name, not by ellipsing
    // it. #1114 used `text-overflow: ellipsis` for this, which kept the row
    // from squeezing but put the truncated text behind a `title=` tooltip —
    // unreachable on the phone this audience uses at a venue, and banned by
    // PRODUCT.md ("no hover-only affordances"). Wrapping serves the same
    // intent: the row grows taller instead of hiding its own label.
    expect(css).toMatch(/\.myk9-entries-class-name\s*{[\s\S]*overflow-wrap: anywhere;/);
    expect(css).not.toMatch(/\.myk9-entries-class-name\s*{[^}]*white-space: nowrap;/);
    expect(css).toMatch(
      /@media \(max-width: 768px\)[\s\S]*\.myk9-entries-class-row\s*{[\s\S]*flex-direction: column;/
    );
  });
});
