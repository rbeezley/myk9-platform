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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const MIGRATIONS_DIR = resolve(process.cwd(), '../../supabase/migrations');
const SRC_DIR = resolve(process.cwd(), 'src');

const PII_COLUMNS = ['date_of_birth', 'junior_handler_numbers'] as const;
const MIGRATION_VERSION = '20260919174531';

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
 * Every `from(... 'people' ...)` chain in a file, with its `.select(...)`.
 *
 * Statement-scoped on purpose: a file-wide regex flags a `select('*')` on some
 * OTHER table that merely happens to live beside a people read, which is six
 * false positives in this repo. Matches single, double and backtick quoting, and
 * the `untypedFrom(client, 'people')` helper — round 2 pointed out the first
 * version read only the literal `from('people')`.
 */
const PEOPLE_FROM = /(?:untypedFrom\s*\([^)]*?,\s*|\bfrom\s*\(\s*)['"`]people['"`]/g;

function peopleSelectChains(source: string): string[] {
  const chains: string[] = [];
  for (const match of source.matchAll(PEOPLE_FROM)) {
    const rest = source.slice(match.index, match.index + 800);
    const end = rest.indexOf(';');
    chains.push(end === -1 ? rest : rest.slice(0, end));
  }
  return chains;
}

/**
 * Column lists this scanner can vouch for by name. A `.select(SOME_CONSTANT)`
 * is opaque to a text scan, so an unlisted identifier fails rather than passes:
 * round 2 noted that `.select(VARIABLE)` sailed through regardless of what the
 * variable held, which is the same blind spot as `select('*')` wearing a hat.
 */
const VOUCHED_COLUMN_CONSTANTS = new Set([
  'PEOPLE_MAPPER_COLUMNS',
  'PEOPLE_DIRECTORY_COLUMNS',
  'COUNT_COLUMN',
]);

/** 'star' | 'opaque' | null — why this chain's select cannot be vouched for. */
function selectProblem(chain: string): 'star' | 'opaque' | null {
  const quoted = /\.\s*select\s*\(\s*(['"`])([\s\S]*?)\1/.exec(chain);
  if (quoted) return /^\s*\*/.test(quoted[2] ?? '') ? 'star' : null;

  const identifier = /\.\s*select\s*\(\s*([A-Za-z_$][\w$]*)\s*[,)]/.exec(chain);
  if (identifier) return VOUCHED_COLUMN_CONSTANTS.has(identifier[1] ?? '') ? null : 'opaque';

  return null;
}

/** Every directory holding app or edge-function code that may read `people`. */
const SCAN_ROOTS = [
  SRC_DIR,
  resolve(process.cwd(), '../../supabase/functions'),
  resolve(process.cwd(), 'supabase/functions'),
].filter(dir => existsSync(dir));

describe('the migration that protects the private columns', () => {
  const file = migrationFiles().find(f => f.startsWith(MIGRATION_VERSION));

  it('exists', () => {
    expect(file, `no migration starting ${MIGRATION_VERSION}`).toBeDefined();
  });

  it('creates the private boundary and revokes anonymous access explicitly', () => {
    const sql = sqlWithoutProse(readFileSync(resolve(MIGRATIONS_DIR, file!), 'utf8'));
    expect(sql).toMatch(/CREATE TABLE public\.people_private/i);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.people_private FROM anon/i);
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.people_private TO authenticated/i);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS date_of_birth/i);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS junior_handler_numbers/i);
  });

  it('backfills before removing the legacy columns', () => {
    const sql = sqlWithoutProse(readFileSync(resolve(MIGRATIONS_DIR, file!), 'utf8'));
    const backfillAt = sql.search(/INSERT INTO public\.people_private/i);
    const dropAt = sql.search(/DROP COLUMN IF EXISTS date_of_birth/i);
    expect(backfillAt).toBeGreaterThan(-1);
    expect(dropAt).toBeGreaterThan(backfillAt);
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
        if (!/\bON\s+(?:TABLE\s+)?(?:public\.)?(?:people|people_private)\b/i.test(flat)) continue;
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
  it('no read of public.people anywhere uses a star or an unvouched column list', () => {
    const offenders: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of walk(root)) {
        if (/\.test\.tsx?$/.test(file) || file.includes(`${sep}test${sep}`)) continue;
        const source = jsWithoutComments(readFileSync(file, 'utf8'));
        for (const chain of peopleSelectChains(source)) {
          const problem = selectProblem(chain);
          if (problem) offenders.push(`${problem}: ${file}: ${chain.slice(0, 120)}`);
        }
      }
    }
    expect(
      offenders,
      'a star select on people ships date_of_birth to every caller AND hides it from this ' +
        'test; an unrecognised column constant is the same blind spot wearing a hat — ' +
        'inline the columns or add the constant to VOUCHED_COLUMN_CONSTANTS'
    ).toEqual([]);
  });

  it('covers the edge functions, which run as service_role with RLS bypassed', () => {
    // The payloads where a star would matter most. If this stops finding people
    // reads there, the assertion above has quietly stopped covering them.
    const functionRoots = SCAN_ROOTS.filter(root => root !== SRC_DIR);
    expect(
      functionRoots.length,
      'no supabase/functions directory was found to scan'
    ).toBeGreaterThan(0);
    const peopleReads = functionRoots.flatMap(root =>
      walk(root).flatMap(file => peopleSelectChains(jsWithoutComments(readFileSync(file, 'utf8'))))
    );
    expect(peopleReads.length, 'expected edge functions to read people').toBeGreaterThan(0);
  });

  it('positive control: the scanner catches both star spellings, quoting styles and opaque lists', () => {
    // Without this, the assertion above passes just as happily on a broken regex
    // — and a file-wide scan would flag a `select('*')` on some OTHER table.
    const problems = (src: string) => peopleSelectChains(src).map(selectProblem).filter(Boolean);
    expect(problems(`supabase.from('people').select('*').eq('id', id);`)).toEqual(['star']);
    expect(problems('supabase.from("people").select("*").eq(1);')).toEqual(['star']);
    expect(problems('supabase.from(`people`).select(`*, dogs(id)`).eq(1);')).toEqual(['star']);
    expect(problems(".from('people')\n  .select(`\n    *,\n    dogs(id)\n  `)\n  .is(1);")).toEqual(
      ['star']
    );
    expect(problems("untypedFrom(supabase, 'people').select('*').is(1);")).toEqual(['star']);
    // An opaque constant is refused; the two vouched ones are not.
    expect(problems(".from('people').select(SOME_MYSTERY_LIST).is(1);")).toEqual(['opaque']);
    expect(problems(".from('people').select(PEOPLE_MAPPER_COLUMNS).is(1);")).toEqual([]);
    expect(problems(".from('people').select(PEOPLE_DIRECTORY_COLUMNS).is(1);")).toEqual([]);
    expect(problems(".from('people').select('id, first_name').is(1);")).toEqual([]);
    // A star on a different table is not ours.
    expect(problems(".from('dogs').select('*').is(1);")).toEqual([]);
  });

  it('positive control: the app DOES read the columns somewhere', () => {
    // Otherwise the absence assertions above are satisfied by a feature that was
    // never wired up (LESSON dead-suite-reds).
    const readers = [
      'services/database/users/privatePeople.ts',
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
