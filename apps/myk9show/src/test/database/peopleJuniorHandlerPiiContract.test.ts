/**
 * MYK9-570. `people.date_of_birth` is personal data about a handler who may be a
 * child. Three properties have to hold, and none of them is visible in a diff of
 * the feature code:
 *
 *  1. No migration ever grants `anon` those columns, table-wide or by column.
 *  2. No SQL view projects them (a view is the other way anon reaches a table).
 *  3. No public/anon-facing read in the app selects or renders them.
 *
 * A test that only grepped for the word "date_of_birth" would pass on a comment
 * (LESSON comment-satisfies-grep), so every assertion below strips SQL and JS
 * comments before scanning, and each one has a positive control proving the
 * scanner can still see a real occurrence.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const MIGRATIONS_DIR = resolve(process.cwd(), '../../supabase/migrations');
const SRC_DIR = resolve(process.cwd(), 'src');

const PII_COLUMNS = ['date_of_birth', 'junior_handler_numbers'] as const;
const MIGRATION_VERSION = '20260918154700';

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
}

/** SQL with line comments and single-quoted literals removed — prose cannot satisfy a scan. */
function sqlWithoutProse(source: string): string {
  return source.replace(/--[^\n]*/g, '').replace(/'(?:[^']|'')*'/g, "''");
}

function jsWithoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * The `.select(...)` argument of every `from('people')` chain in a file.
 *
 * Statement-scoped on purpose: a file-wide regex flags a `select('*')` on some
 * OTHER table that merely happens to live beside a people read, which is six
 * false positives in this repo.
 */
function peopleSelectChains(source: string): string[] {
  const chains: string[] = [];
  const marker = "from('people')";
  let at = source.indexOf(marker);
  while (at !== -1) {
    const rest = source.slice(at, at + 800);
    const end = rest.indexOf(';');
    chains.push(end === -1 ? rest : rest.slice(0, end));
    at = source.indexOf(marker, at + marker.length);
  }
  return chains;
}

/** Does this chain's first `.select(` argument begin with a `*`? */
function selectsStar(chain: string): boolean {
  const match = /\.\s*select\s*\(\s*(['"`])([\s\S]*?)\1/.exec(chain);
  if (!match) return false;
  return /^\s*\*/.test(match[2] ?? '');
}

describe('the migration that adds the columns', () => {
  const file = migrationFiles().find(f => f.startsWith(MIGRATION_VERSION));

  it('exists', () => {
    expect(file, `no migration starting ${MIGRATION_VERSION}`).toBeDefined();
  });

  it('adds both columns and revokes them from anon explicitly', () => {
    const sql = sqlWithoutProse(readFileSync(resolve(MIGRATIONS_DIR, file!), 'utf8'));
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS date_of_birth date/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS junior_handler_numbers jsonb NOT NULL/i);
    expect(sql).toMatch(
      /REVOKE ALL \(date_of_birth, junior_handler_numbers\) ON public\.people FROM anon/i
    );
  });

  it('re-affirms the four-column anon allowlist after that revoke, and adds nothing', () => {
    // A column-scoped REVOKE on a table is modelled by anonEntriesGrantContract as
    // clearing every column grant, so the re-grant is what keeps the judge embeds
    // on the public show pages resolving. Order matters: revoke, then grant.
    const sql = sqlWithoutProse(readFileSync(resolve(MIGRATIONS_DIR, file!), 'utf8'));
    const revokeAt = sql.search(/REVOKE ALL \(date_of_birth/i);
    const grantAt = sql.search(
      /GRANT SELECT \(id, first_name, last_name, email\) ON public\.people/i
    );
    expect(revokeAt).toBeGreaterThan(-1);
    expect(grantAt).toBeGreaterThan(revokeAt);
  });

  it('pins the jsonb key set to the same registries as RegistryId', () => {
    // Comments only: `sqlWithoutProse` also blanks string literals, which is
    // exactly what the registry key list is made of.
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file!), 'utf8').replace(/--[^\n]*/g, '');
    expect(sql).toMatch(/junior_handler_numbers - ARRAY\['AKC', 'UKC', 'ASCA'\]/i);
    for (const registryId of ['AKC', 'UKC', 'ASCA']) {
      expect(sql, `the CHECK must type-test the ${registryId} value`).toMatch(
        new RegExp(`junior_handler_numbers -> '${registryId}'\\) = 'string'`, 'i')
      );
    }
  });
});

describe('no migration exposes the columns to anon', () => {
  it('never grants anon a people column list containing either column', () => {
    const offenders: string[] = [];
    for (const file of migrationFiles()) {
      const sql = sqlWithoutProse(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'));
      for (const statement of sql.split(';')) {
        const flat = statement.replace(/\s+/g, ' ');
        if (!/\bGRANT\b/i.test(flat)) continue;
        if (!/\bON\s+(?:TABLE\s+)?(?:public\.)?people\b/i.test(flat)) continue;
        if (!/\bTO\b[^;]*\b(?:anon|PUBLIC)\b/i.test(flat)) continue;
        if (PII_COLUMNS.some(column => flat.includes(column))) offenders.push(`${file}: ${flat}`);
      }
    }
    expect(offenders, 'anon must never be granted the junior handler PII columns').toEqual([]);
  });

  it('positive control: the scanner does see the real anon people grants', () => {
    // If this stops matching, the scan above proves nothing.
    const seen = migrationFiles().some(file => {
      const sql = sqlWithoutProse(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'));
      return /GRANT SELECT \([^)]*first_name[^)]*\) ON public\.people TO anon/i.test(sql);
    });
    expect(seen).toBe(true);
  });

  it('no view definition in any migration projects either column', () => {
    const offenders: string[] = [];
    for (const file of migrationFiles()) {
      const sql = sqlWithoutProse(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'));
      for (const statement of sql.split(';')) {
        if (!/CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW/i.test(statement)) continue;
        if (PII_COLUMNS.some(column => statement.includes(column))) {
          offenders.push(`${file}: ${statement.replace(/\s+/g, ' ').slice(0, 160)}`);
        }
      }
    }
    expect(offenders, 'a view is the other way anon reaches a table').toEqual([]);
  });
});

describe('no public or anon-facing app read carries the columns', () => {
  /**
   * The reads anon can actually make. `publicReads.ts` and the TV display are the
   * anon surfaces; the premium/experience snapshot is published to the public web.
   */
  const PUBLIC_READ_PATHS = [
    'services/database/entries/publicReads.ts',
    'services/database/classes/publicReads.ts',
    'services/database/tv-display/postgrest.ts',
    'hooks/queries/useShowJudges.ts',
  ];

  it.each(PUBLIC_READ_PATHS)('%s selects neither column', relativePath => {
    const source = jsWithoutComments(readFileSync(resolve(SRC_DIR, relativePath), 'utf8'));
    for (const column of PII_COLUMNS) {
      expect(source, `${relativePath} must not read people.${column}`).not.toContain(column);
    }
  });

  it('no file under pages/TVDisplay mentions either column', () => {
    const offenders = walk(resolve(SRC_DIR, 'pages/TVDisplay')).filter(file =>
      PII_COLUMNS.some(column => jsWithoutComments(readFileSync(file, 'utf8')).includes(column))
    );
    expect(offenders).toEqual([]);
  });

  /**
   * The hole round 1 found in the assertions above: they look for the COLUMN
   * NAMES, and `select('*')` contains neither, so a star-select on `people` is
   * green by construction while shipping the PII. There were six of them.
   */
  it('no read of public.people anywhere in the app uses a star select', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_DIR)) {
      if (/\.test\.tsx?$/.test(file) || file.includes(`${sep}test${sep}`)) continue;
      const source = jsWithoutComments(readFileSync(file, 'utf8'));
      for (const chain of peopleSelectChains(source)) {
        if (selectsStar(chain)) offenders.push(`${file.slice(SRC_DIR.length + 1)}: ${chain}`);
      }
    }
    expect(
      offenders,
      'a star select on people ships date_of_birth to every caller AND hides it from this test'
    ).toEqual([]);
  });

  it('positive control: the scanner catches both star spellings, and only on people', () => {
    // Without this, the assertion above passes just as happily on a broken regex
    // — and a file-wide scan would flag a `select('*')` on some OTHER table.
    const starOnPeople = (src: string) => peopleSelectChains(src).some(selectsStar);
    expect(starOnPeople(`supabase.from('people').select('*').eq('id', id);`)).toBe(true);
    expect(starOnPeople("supabase.from('people').select(`*, dogs(id)`).eq(1);")).toBe(true);
    expect(
      starOnPeople(".from('people')\n  .select(`\n    *,\n    dogs(id)\n  `)\n  .is(1);")
    ).toBe(true);
    // The explicit lists that replaced them, and a star on a different table.
    expect(starOnPeople(".from('people').select(PEOPLE_MAPPER_COLUMNS).is(1);")).toBe(false);
    expect(starOnPeople(".from('people').select('id, first_name').is(1);")).toBe(false);
    expect(starOnPeople(".from('dogs').select('*').is(1);")).toBe(false);
  });

  it('positive control: the app DOES read the columns somewhere', () => {
    // Otherwise the absence assertions above are satisfied by a feature that was
    // never wired up (LESSON dead-suite-reds).
    const readers = [
      'services/database/users/juniorHandlerProfiles.ts',
      'hooks/queries/useEntryFormData.ts',
    ];
    for (const relativePath of readers) {
      const source = jsWithoutComments(readFileSync(resolve(SRC_DIR, relativePath), 'utf8'));
      expect(source, `${relativePath} should select the junior handler columns`).toContain(
        'junior_handler_numbers'
      );
      expect(source).toContain('date_of_birth');
    }
  });
});
