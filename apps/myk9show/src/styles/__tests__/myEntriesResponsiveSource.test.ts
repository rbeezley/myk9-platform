import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The `.myk9-entries-*` block moved to its own stylesheet with the dog-first
// redesign (MYK9-482); the rules and this guard came with it.
const cssPath = path.resolve(__dirname, '../myk9-my-shows.css');

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
    // The row is a three-column grid now (class name · when · state), so the
    // phone rescue is collapsing it to one column rather than switching a
    // flex direction. Same intent: the row stacks instead of squeezing.
    expect(css).toMatch(
      /@media \(max-width: 768px\)[\s\S]*\.myk9-entries-class-row\s*{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/
    );
  });
});
