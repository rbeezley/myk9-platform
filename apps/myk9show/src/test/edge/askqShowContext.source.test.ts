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

  it('verifies show access through the shared caller predicate, not a show-scoped user_roles lookup', () => {
    // MYK9-1776: club-appointed secretaries have club-scoped user_roles rows
    // (show_id null), so a show_id-equality lookup denied them.
    const accessCheck = sliceBetween('if (showId && showData?.name) {', 'if (hasAccess) {');

    expect(accessCheck).toContain('callerHasShowAccess(supabaseClient, showId)');
    expect(accessCheck).not.toContain("from('user_roles')");
    expect(source).toContain("from '../_shared/askq/showAccess.ts'");
  });
});
