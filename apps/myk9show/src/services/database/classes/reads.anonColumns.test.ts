import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CLASS_COLUMNS, CLASS_HIDE_SECRET_COLUMNS } from './reads';

/**
 * MYK9-116 / SA-2026-07-29-01.
 *
 * The PostgREST class readers in `reads.ts` are the cold-store fallback every logged-out
 * guest lands on, so they run as the Postgres `anon` role — whose SELECT on `public.classes`
 * is now a column allowlist that withholds the scent-work hide secrets.
 *
 * That makes the TS column list and the SQL allowlist a single coupled contract, split
 * across two files that no compiler relates:
 *   - a column in TS but not SQL  → 42501, and `getAllClasses` swallows it into a silently
 *     empty public class list (`reads.ts` catch on the cold branch).
 *   - a column in SQL but not TS  → surplus anon exposure, invisible until the next audit.
 * So this parses the migration and asserts set equality, rather than trusting review.
 *
 * `anonEntriesGrantContract.test.ts` guards the other direction — that no LATER migration
 * re-grants anon a table-wide SELECT, which is how this exact bug class shipped twice before.
 */
const MIGRATION = resolve(
  __dirname,
  '../../../../../../supabase/migrations/20260730140000_anon_classes_hide_column_allowlist.sql'
);

/** The column list from the migration's `GRANT SELECT (...) ON public.classes TO anon`. */
function grantedAnonColumns(): string[] {
  const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
  const match = sql.match(/GRANT\s+SELECT\s*\(([^)]*)\)\s*ON\s+public\.classes\s+TO\s+anon/i);
  if (!match) throw new Error('migration no longer contains an anon column grant on classes');
  return match[1]
    .split(',')
    .map(column => column.trim())
    .filter(Boolean);
}

describe('anon column allowlist on public.classes', () => {
  it('withholds the hide secrets from the client select', () => {
    for (const column of CLASS_HIDE_SECRET_COLUMNS) {
      expect(
        [...CLASS_COLUMNS] as string[],
        `${column} must not be selected — the readers run as anon for guests`
      ).not.toContain(column);
    }
  });

  it('withholds the hide secrets from the SQL grant', () => {
    const granted = grantedAnonColumns();
    for (const column of CLASS_HIDE_SECRET_COLUMNS) {
      expect(granted, `anon must not be granted classes.${column}`).not.toContain(column);
    }
  });

  it('selects exactly what the migration grants — no column on one side only', () => {
    expect([...CLASS_COLUMNS].sort()).toEqual(grantedAnonColumns().sort());
  });

  it('names every column instead of `*` in the anon-reachable readers', () => {
    // PostgREST expands `select=*` to every column in the TABLE, not every column the
    // caller is granted, so a single `*` here 42501s every guest request.
    const source = readFileSync(resolve(__dirname, 'reads.ts'), 'utf8');
    const selects = [...source.matchAll(/\.from\('classes'\)\s*\n?\s*\.select\(\s*`([^`]*)`/g)].map(
      match => match[1]
    );

    expect(selects.length, 'expected the PostgREST class reads to still be template selects').toBe(
      4
    );
    for (const select of selects) {
      expect(select, 'anon-reachable class select must not use `*`').not.toMatch(/^\s*\*/m);
    }
  });
});
