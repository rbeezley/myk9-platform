import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CLASS_AUTHENTICATED_COLUMNS, CLASS_OFFICIAL_ONLY_COLUMNS } from './reads';

/**
 * `authenticated` reads public.classes through a column allowlist (20260731170000), so the class
 * replication select (`CLASS_AUTHENTICATED_COLUMN_SELECT`) and the SQL grant are one contract in
 * two files. A column selected but not granted 42501s every signed-in class sync; MYK9-1030 added
 * two (judge_signed_off_at / _by) and had to add both to the grant. Parsed from the LATEST
 * `GRANT SELECT (...) ON public.classes TO authenticated`, the same way the anon twin does.
 */
const MIGRATIONS_DIR = resolve(__dirname, '../../../../../../supabase/migrations');
const AUTHENTICATED_CLASS_GRANT =
  /GRANT\s+SELECT\s*\(([^)]*)\)\s*ON\s+public\.classes\s+TO\s+authenticated/i;

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

function grantedAuthenticatedColumns(): string[] {
  const defining = readdirSync(MIGRATIONS_DIR)
    .filter(name => name.endsWith('.sql'))
    .sort()
    .filter(name =>
      AUTHENTICATED_CLASS_GRANT.test(
        stripComments(readFileSync(resolve(MIGRATIONS_DIR, name), 'utf8'))
      )
    );
  const latest = defining.at(-1);
  if (!latest) throw new Error('no migration grants authenticated a column list on classes');
  const match = stripComments(readFileSync(resolve(MIGRATIONS_DIR, latest), 'utf8')).match(
    AUTHENTICATED_CLASS_GRANT
  );
  return match![1]!
    .split(',')
    .map(column => column.trim())
    .filter(Boolean);
}

describe('authenticated column allowlist on public.classes', () => {
  it('selects exactly what the latest migration grants', () => {
    expect([...CLASS_AUTHENTICATED_COLUMNS].sort()).toEqual(grantedAuthenticatedColumns().sort());
  });

  it("grants the judge's sign-off and results-check columns (MYK9-1030)", () => {
    expect(grantedAuthenticatedColumns()).toEqual(
      expect.arrayContaining([
        'judge_signed_off_at',
        'judge_signed_off_by',
        'results_verified_at',
        'results_verified_by',
      ])
    );
  });

  it('still withholds the official-only hide count', () => {
    for (const column of CLASS_OFFICIAL_ONLY_COLUMNS) {
      expect(grantedAuthenticatedColumns()).not.toContain(column);
    }
  });
});
