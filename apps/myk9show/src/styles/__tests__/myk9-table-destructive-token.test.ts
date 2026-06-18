import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the admin table's destructive menu item against regressing to a
 * hard-coded red. `.myk9-table-dropdown-item.destructive` must use the themed
 * --destructive-strong token (AA on card/popover surfaces in both themes); the
 * old #ff3b30 was only ~3.4:1 on the card and overrode the primitive's token.
 */
const cssPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'myk9-table.css'
);
const css = readFileSync(cssPath, 'utf8');

describe('myk9-table destructive dropdown item', () => {
  it('uses the --destructive-strong theme token, not a hard-coded hex', () => {
    const block = css.slice(css.indexOf('.myk9-table-dropdown-item.destructive'));
    expect(block).toContain('rgb(var(--destructive-strong))');
    expect(block).not.toContain('#ff3b30');
  });
});
