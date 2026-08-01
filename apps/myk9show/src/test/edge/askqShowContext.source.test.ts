import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(__dirname, '../../../../../supabase/functions/ask-myk9show/index.ts'),
  'utf8'
);

function sliceBetween(start: string, end: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('ask-myk9show show context contract', () => {
  it('selects the current shows.name column for requested show context', () => {
    expect(source).toContain("from('shows').select('name').eq('id', showId).single()");
    expect(source).not.toContain("from('shows').select('show_name')");
    expect(source).toContain('showData?.name');
  });

  it('verifies show-scoped officials through denormalized auth_user_id and show_id', () => {
    // Slice from the WRAPPER, not from `from('user_roles')` — #1561 moved the
    // `is_active` / `expires_at` predicate into applyActiveRoleValidity(), and
    // the call sits outside the query chain. Starting the slice at the table
    // name would put the guard out of view and read as if it were missing.
    const roleCheck = sliceBetween('applyActiveRoleValidity(', 'dogIds.length > 0');

    expect(roleCheck).toContain("from('user_roles')");
    expect(roleCheck).toContain(".eq('auth_user_id', user.id)");
    expect(roleCheck).toContain(".eq('show_id', showId)");
    expect(roleCheck).not.toContain(".eq('user_id', user.id)");
    expect(roleCheck).not.toContain(".eq('scope_type'");
    expect(roleCheck).not.toContain(".eq('scope_id'");
  });
});
