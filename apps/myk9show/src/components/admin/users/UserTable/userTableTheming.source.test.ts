/**
 * Source-text regression pins for the User Management table presentation
 * (overnight impeccable sweep p10). These guard the mechanical fixes that a
 * render test can't reach cheaply (DataTable-only column cells) and that
 * silent class drift would re-break:
 *
 *  - status colors stay on semantic tokens / mode-resilient -500 bases, never
 *    raw inline hex or hand-paired `dark:` status classes (eslint also bans the
 *    latter, but this pins the specific lines that regressed once);
 *  - the row + select-all checkboxes carry accessible labels.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

const tableSrc = readFileSync(join(__dirname, 'index.tsx'), 'utf8');
const filtersSrc = readFileSync(join(__dirname, '..', 'UserFilters.tsx'), 'utf8');
const bulkSrc = readFileSync(join(__dirname, '..', 'BulkActionsBar.tsx'), 'utf8');

describe('UserTable theming pins', () => {
  it('stale-login marker uses the destructive token, not an inline hex', () => {
    expect(tableSrc).toContain("'text-destructive'");
    expect(tableSrc).not.toContain('#EF4444');
  });

  it('checkboxes use the design-system border/accent, not raw gray/blue palette', () => {
    expect(tableSrc).not.toContain('border-gray-400');
    expect(tableSrc).not.toContain('accent-blue-500');
    expect(tableSrc).toContain('border-input accent-primary');
  });

  it('both checkboxes expose an accessible label', () => {
    expect(tableSrc).toContain('aria-label="Select all users on this page"');
    expect(tableSrc).toContain('aria-label={`Select ${getUserFullName(user)}`}');
  });
});

describe('no hand-paired dark: status classes (eslint-backed)', () => {
  const banned = /dark:(?:text|bg|border)-(?:red|blue|amber|orange|yellow|green|emerald)-\d+/;

  it('UserTable has no banned dark: status pair', () => {
    expect(banned.test(tableSrc)).toBe(false);
  });

  it('UserFilters has no banned dark: status pair', () => {
    expect(banned.test(filtersSrc)).toBe(false);
  });

  it('BulkActionsBar has no banned dark: status pair', () => {
    expect(banned.test(bulkSrc)).toBe(false);
  });
});

describe('UserFilters / BulkActionsBar status semantics', () => {
  it('active status chip uses the success token', () => {
    expect(filtersSrc).toContain('bg-success/10 text-success');
  });

  it('bulk status dropdown focus states use semantic tokens', () => {
    expect(bulkSrc).toContain('focus:bg-success/10 focus:text-success');
    expect(bulkSrc).toContain('focus:bg-warning/10 focus:text-warning');
    expect(bulkSrc).toContain('focus:bg-destructive/10 focus:text-destructive');
  });
});
