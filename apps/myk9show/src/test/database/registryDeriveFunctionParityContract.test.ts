import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { listRegistries } from '@/features/registries';

/**
 * MYK9-490: the set of configured registries now lives on BOTH sides of the wire.
 *
 * The client has `REGISTRIES` in `features/registries/lookup.ts` (exposed as
 * `listRegistries()`); the server has the `IN (...)` list inside
 * `public.derive_registry_id(text)`, which the one-registry-per-show trigger compares every
 * trial write against.
 *
 * A registry added on the client only is not a cosmetic drift. The show-creation wizard would
 * stamp the new id on every trial, the server would derive `'AKC'` for that organization, and
 * `create_show_with_children` would raise MK490 on the FIRST trial — the whole show creation
 * fails, for the one organization someone just finished adding. Nothing else in the suite can
 * see it: the client is internally consistent, the SQL is internally consistent, and they
 * disagree only with each other.
 *
 * Reads the migration corpus rather than the live database so it runs offline in CI, matching
 * the other contract tests in this directory.
 */

const MIGRATIONS = join(process.cwd(), '..', '..', 'supabase', 'migrations');
const DEFINITION = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.derive_registry_id\s*\(/i;

/**
 * Migration SQL with comments stripped.
 *
 * The match MUST run against this and not the raw file: these migrations quote their own SQL
 * in their rationale headers, so a prose line naming AKC/UKC/ASCA would satisfy the pattern
 * even if the statement that does the work were deleted or changed.
 */
function executableSql(file: string): string {
  return readFileSync(join(MIGRATIONS, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ');
}

/**
 * The LATEST migration that defines the function, not the first.
 *
 * `CREATE OR REPLACE` means a later migration silently wins, so pinning the original would
 * assert against a definition the database no longer runs.
 */
function latestDefiningMigration(): string {
  const defining = readdirSync(MIGRATIONS)
    .filter(file => file.endsWith('.sql'))
    .filter(file => DEFINITION.test(executableSql(file)))
    .sort();
  if (defining.length === 0) {
    throw new Error('No migration defines public.derive_registry_id — the contract has no subject');
  }
  return defining[defining.length - 1]!;
}

function serverRegistrySet(file: string): string[] {
  const sql = executableSql(file);
  const body = sql.slice(sql.search(DEFINITION));
  const list = /btrim\s*\(\s*p_organization\s*\)\s+IN\s*\(([^)]*)\)/i.exec(body);
  if (!list) {
    throw new Error(
      `Could not find the registry IN (...) list inside derive_registry_id in ${file}. ` +
        'If the derivation was restructured, update this contract to read the new shape — ' +
        'do not delete it.'
    );
  }
  return [...list[1]!.matchAll(/'([^']+)'/g)].map(match => match[1]!).sort();
}

describe('derive_registry_id ↔ client registry parity', () => {
  it('finds exactly one latest migration defining the function', () => {
    // A rename or an accidental deletion would otherwise make every assertion below throw a
    // confusing regex error instead of naming the real problem.
    expect(latestDefiningMigration()).toMatch(/^\d{14}_.*\.sql$/);
  });

  it('recognises the same registries the client does', () => {
    const client = [...listRegistries()].sort();
    expect(serverRegistrySet(latestDefiningMigration())).toEqual(client);
  });

  it('pins the current set so adding a registry is a deliberate two-sided change', () => {
    // Not redundant with the parity assertion above: parity alone stays green if someone
    // removes a registry from BOTH sides, which is a product decision, not a refactor.
    expect([...listRegistries()].sort()).toEqual(['AKC', 'ASCA', 'UKC']);
  });
});
