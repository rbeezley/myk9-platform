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
import { resolve } from 'node:path';

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
