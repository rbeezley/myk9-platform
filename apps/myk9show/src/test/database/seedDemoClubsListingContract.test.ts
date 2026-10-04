import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// MYK9-952: the seed-demo and load-fixture clubs are published on purpose (the
// E2E specs need their shows public), so they carry clubs.is_demo = true to stay
// off the signed-out listings. Acceptance: "a reseed does not bring them back
// into public view", so the SEED must set the flag on every run, on insert AND
// on conflict. A migration backfill alone would be undone by the next reseed of
// a fresh database. The migration's behaviour is covered by
// supabase/tests/myk9_952_demo_clubs_listing_test.sql (CI-only); this pins the
// seed text, which no database test can see before the seed runs.

const repoRoot = resolve(__dirname, '../../../../..');

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

/** The single `INSERT INTO public.clubs ... ;` statement in a seed file. */
function clubsInsert(seed: string): string {
  const start = seed.indexOf('INSERT INTO public.clubs (');
  expect(start, 'seed has a clubs INSERT').toBeGreaterThan(-1);
  expect(seed.indexOf('INSERT INTO public.clubs (', start + 1), 'exactly one clubs INSERT').toBe(
    -1
  );
  return seed.slice(start, seed.indexOf(';', start));
}

function columnList(statement: string): string[] {
  const open = statement.indexOf('(');
  return statement
    .slice(open + 1, statement.indexOf(')', open))
    .split(',')
    .map(column => column.trim());
}

describe('seed-demo clubs are demo clubs (MYK9-952)', () => {
  const statement = clubsInsert(read('supabase/seed-demo.sql'));
  const columns = columnList(statement);
  const isDemoIndex = columns.indexOf('is_demo');

  it('declares is_demo in the clubs INSERT', () => {
    expect(isDemoIndex).toBeGreaterThan(-1);
  });

  it('inserts every demo club with is_demo = true', () => {
    const valuesStart = statement.indexOf('VALUES');
    const conflictStart = statement.indexOf('ON CONFLICT');
    // Each VALUES tuple starts with its quoted uuid. Split the tuples on the
    // `),\n(` boundary, then read the column at is_demo's position from the end,
    // since description strings may contain commas but the trailing scalars do not.
    const tuples = statement
      .slice(valuesStart + 'VALUES'.length, conflictStart)
      .trim()
      .replace(/^\(/, '')
      .replace(/\)\s*$/, '')
      .split(/\)\s*,\s*\(/);
    expect(tuples.map(tuple => tuple.match(/'(dededede-[^']+)'/)?.[1])).toEqual([
      'dededede-0000-0000-0000-000000000001',
      'dededede-0000-0000-0000-000000000002',
    ]);
    const fromEnd = columns.length - isDemoIndex;
    for (const tuple of tuples) {
      const scalars = tuple.split(',').map(value => value.trim());
      expect(scalars[scalars.length - fromEnd]).toBe('true');
    }
  });

  it('re-asserts is_demo on conflict, so a reseed over a cleared flag restores it', () => {
    const conflict = statement.slice(statement.indexOf('ON CONFLICT (id) DO UPDATE'));
    expect(conflict).toMatch(/\bis_demo\s*=\s*EXCLUDED\.is_demo\b/);
  });
});

describe('load-fixture clubs are demo clubs (MYK9-952)', () => {
  const statement = clubsInsert(read('supabase/seed-load-fixture.sql'));
  const columns = columnList(statement);

  it('declares is_demo last and selects true for it', () => {
    // is_demo is the LAST column, so it pairs with the last select expression
    // (earlier lines hold format(...) calls and two-column lines, so a
    // position count from the front would misread them).
    expect(columns[columns.length - 1]).toBe('is_demo');
    const selectLines = statement
      .slice(statement.indexOf('SELECT') + 'SELECT'.length, statement.indexOf('FROM (VALUES'))
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('--'));
    expect(selectLines[selectLines.length - 1]).toBe('true');
  });
});
