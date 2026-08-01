/**
 * Source-text regression pins for the User Management table presentation.
 * These guard the mechanical fixes a render test can't reach cheaply
 * (DataTable-only column cells) and that silent class drift would re-break.
 *
 * The pins were tightened in the /admin/users impeccable run: the previous
 * versions allowed inline hex as long as it wasn't one specific value, which
 * let `#007AFF`, `#34C759`, `#8E8E93` and friends live in ROLE_CONFIG and the
 * status configs. Those rendered at 2.0-3.6:1 in light mode and were identical
 * in dark mode. Status and role colour must now come from `--chip-*` pairs,
 * which ship both themes.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

const tableSrc = readFileSync(join(__dirname, 'index.tsx'), 'utf8');
const typesSrc = readFileSync(join(__dirname, 'types.ts'), 'utf8');
const utilsSrc = readFileSync(join(__dirname, 'utils.ts'), 'utf8');
const filtersSrc = readFileSync(join(__dirname, '..', 'UserFilters.tsx'), 'utf8');
const bulkSrc = readFileSync(join(__dirname, '..', 'BulkActionsBar.tsx'), 'utf8');
const tableCss = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'styles', 'myk9-table.css'),
  'utf8'
);

const HEX = /#[0-9a-fA-F]{3,8}\b/;

describe('no inline hex in the user table presentation layer', () => {
  it.each([
    ['UserTable/index.tsx', tableSrc],
    ['UserTable/types.ts', typesSrc],
    ['UserTable/utils.ts', utilsSrc],
    ['UserFilters.tsx', filtersSrc],
    ['BulkActionsBar.tsx', bulkSrc],
    ['myk9-table.css', tableCss],
  ])('%s carries no hardcoded hex colour', (_name, src) => {
    expect(src).not.toMatch(HEX);
  });
});

describe('role and status colour comes from --chip-* token pairs', () => {
  it('every role in ROLE_CONFIG is a chip pair', () => {
    const roles = [
      'exhibitor',
      'judge',
      'secretary',
      'steward',
      'chairman',
      'club_admin',
      'site_admin',
    ];
    roles.forEach(role => expect(typesSrc).toContain(`${role}:`));
    expect(typesSrc).toContain('var(--chip-');
    // The old shape carried `color:`/`background:` hex fields; the new one is a
    // single class string, so a regression would reintroduce those keys.
    expect(typesSrc).not.toContain("background: 'rgba(");
  });

  it('status configs are chip pairs, not inline style values', () => {
    expect(utilsSrc).toContain('var(--chip-green-bg)');
    expect(utilsSrc).toContain('var(--chip-red-bg)');
    expect(utilsSrc).toContain('var(--chip-stone-bg)');
  });

  it('the stale-login marker uses the destructive token', () => {
    expect(tableSrc).toContain('text-destructive');
  });
});

describe('the table inherits the app font (Montserrat), never SF Pro', () => {
  it.each([
    ['UserTable/index.tsx', tableSrc],
    ['UserTable/types.ts', typesSrc],
    ['UserFilters.tsx', filtersSrc],
  ])('%s does not force -apple-system/SF Pro', (_name, src) => {
    expect(src).not.toContain('-apple-system');
    expect(src).not.toContain('SF Pro');
  });
});

describe('accessibility pins', () => {
  it('chip dismiss controls keep a 44px hit area', () => {
    // 24px box + 10px padding each side = 44px, with a matching negative margin
    // so the chip does not grow. Dropping to p-2 silently returns it to 40px.
    expect(filtersSrc).toContain('-m-2.5 box-content p-2.5');
  });

  it('the row action trigger and menu items are 44px', () => {
    expect(tableCss).toContain('width: 44px');
    expect(tableCss).toContain('min-height: 44px');
  });

  it('both checkboxes expose an accessible label', () => {
    expect(tableSrc).toContain('aria-label="Select all users on this page"');
    expect(tableSrc).toContain('aria-label={`Select ${getUserFullName(user)}`}');
  });

  it('checkboxes use the design-system border/accent, not raw gray/blue palette', () => {
    expect(tableSrc).not.toContain('border-gray-400');
    expect(tableSrc).not.toContain('accent-blue-500');
    expect(tableSrc).toContain('border-input accent-primary');
  });

  it('the checkbox and actions columns are marked interactive, so rows stay rows', () => {
    // Without `meta: { interactive: true }` DataTable turns every <tr> into a
    // role="button", which destroys row/column semantics for screen readers.
    expect(tableSrc.match(/meta: \{ interactive: true \}/g) ?? []).toHaveLength(2);
  });
});

describe('no hand-paired dark: status classes (eslint-backed)', () => {
  const banned = /dark:(?:text|bg|border)-(?:red|blue|amber|orange|yellow|green|emerald)-\d+/;

  it.each([
    ['UserTable/index.tsx', tableSrc],
    ['UserFilters.tsx', filtersSrc],
    ['BulkActionsBar.tsx', bulkSrc],
  ])('%s has no banned dark: status pair', (_name, src) => {
    expect(banned.test(src)).toBe(false);
  });
});
