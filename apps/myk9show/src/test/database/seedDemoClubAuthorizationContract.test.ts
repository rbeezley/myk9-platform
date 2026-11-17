import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// MYK9-2105: owner walks run on the Heartland demo club, so the seed must leave it
// authorized (clubs.authorized_at set). Otherwise every authorization check treats it
// as a brand-new club waiting for a site admin. Prairie Trail is a scope boundary
// (MYK9-137) and this issue leaves its authorization alone. This pins the seed text;
// no database test can see it before the seed runs.

const repoRoot = resolve(__dirname, '../../../../..');
const HEARTLAND = 'dededede-0000-0000-0000-000000000001';
const PRAIRIE_TRAIL = 'dededede-0000-0000-0000-000000000002';

const seed = readFileSync(join(repoRoot, 'supabase/seed-demo.sql'), 'utf8');
const start = seed.indexOf('INSERT INTO public.clubs (');
// The statement ends at the first code line ending in `;`; its comments contain semicolons.
const statementLines: string[] = [];
for (const line of seed.slice(start).split('\n')) {
  statementLines.push(line);
  if (!line.trim().startsWith('--') && line.trimEnd().endsWith(';')) break;
}
const statement = statementLines.join('\n');
const open = statement.indexOf('(');
const columns = statement
  .slice(open + 1, statement.indexOf(')', open))
  .split(',')
  .map(column => column.trim());

/** The last scalar of the VALUES tuple for one club id (authorized_at is the last column). */
function lastValueFor(clubId: string): string | undefined {
  const tuples = statement
    .slice(statement.indexOf('VALUES') + 'VALUES'.length, statement.indexOf('ON CONFLICT'))
    .trim()
    .replace(/^\(/, '')
    .replace(/\)\s*$/, '')
    .split(/\)\s*,\s*\(/);
  const tuple = tuples.find(candidate => candidate.includes(`'${clubId}'`));
  return tuple
    ?.split(',')
    .map(value => value.trim())
    .at(-1);
}

describe('seed-demo club authorization (MYK9-2105)', () => {
  it('declares authorized_at as the last clubs column', () => {
    expect(start).toBeGreaterThan(-1);
    expect(columns.at(-1)).toBe('authorized_at');
  });

  it('inserts Heartland authorized and Prairie Trail unauthorized', () => {
    expect(lastValueFor(HEARTLAND)).toBe('now()');
    expect(lastValueFor(PRAIRIE_TRAIL)).toBe('NULL');
  });

  it('on conflict keeps an existing timestamp and restores a revoked Heartland', () => {
    const conflict = statement.slice(statement.indexOf('ON CONFLICT (id) DO UPDATE'));
    expect(conflict).toMatch(
      /\bauthorized_at\s*=\s*COALESCE\(\s*clubs\.authorized_at\s*,\s*EXCLUDED\.authorized_at\s*\)/
    );
    // authorized_by is never reset to DEFAULT: it names the last admin who acted.
    expect(conflict).not.toMatch(/\bauthorized_by\s*=/);
  });
});
