import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { AUTHENTICATED_TABLE_GRANTS } from '../../../supabase/functions/_shared/appliedAclChecks';

/**
 * A new `public` table has to be declared in three hand-maintained registries,
 * and until now the only thing that noticed a missing one was the behavioural
 * SQL suite — which needs a migrations-only Postgres and therefore runs ONLY in
 * CI. On a machine with no container runtime (this project has none, by
 * decision) the first sign of a forgotten registry was a red `SQL tests` job
 * fifteen minutes after the push. That happened twice in one afternoon adding
 * `trial_packet_generation_claims` and `trial_packet_print_reminders`.
 *
 * This test moves that check to where it can run in milliseconds with no
 * database: read the migrations, work out which tables still exist, and require
 * each one to appear in all three lists. It cannot replace the SQL suite — only
 * a real database can say what the grants ACTUALLY are, which is the drift the
 * MYK9-93 contract exists to catch. It only says the registries were not
 * forgotten, which is the half that kept being forgotten.
 *
 * Registered by the `src/**` glob in vitest.config.ts, so unlike the edge
 * function tests this file needs no allowlist entry.
 */

const REPO_ROOT = resolve(__dirname, '../../../../..');
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'supabase/migrations');
const CONTRACT_SQL = resolve(REPO_ROOT, 'supabase/tests/pre_rule_table_grants_test.sql');

/**
 * Comments must go first. `create table` appears in prose in at least two
 * migrations ("CREATE TABLE IF NOT EXISTS made this a no-op", "every CREATE
 * TABLE needs explicit GRANTs"), and matching those yields phantom tables named
 * `made` and `needs` that no registry will ever contain — a permanently red
 * test that teaches everyone to ignore it.
 */
function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

const TABLE_DDL =
  /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:(?<createSchema>"?[a-z_]+"?)\s*\.\s*)?"?(?<created>[a-z_][a-z0-9_]*)"?|drop\s+table\s+(?:if\s+exists\s+)?(?:(?:"?[a-z_]+"?)\s*\.\s*)?"?(?<dropped>[a-z_][a-z0-9_]*)"?|alter\s+table\s+(?:if\s+exists\s+)?(?:(?:"?[a-z_]+"?)\s*\.\s*)?"?(?<renameFrom>[a-z_][a-z0-9_]*)"?\s+rename\s+to\s+"?(?<renameTo>[a-z_][a-z0-9_]*)"?/gi;

/**
 * The public tables the migration history leaves behind, replayed in filename
 * order so a later drop or rename beats an earlier create.
 *
 * Renames matter as much as drops: migration 130 renamed `registrations` to
 * `enrollments`, and a parser that only understood create/drop would demand a
 * grant decision for a table that has not existed since.
 */
function tablesSurvivingMigrations(): Map<string, string> {
  const live = new Map<string, string>();

  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter(n => n.endsWith('.sql'))
    .sort()) {
    const sql = stripSqlComments(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'));

    for (const match of sql.matchAll(TABLE_DDL)) {
      const { createSchema, created, dropped, renameFrom, renameTo } = match.groups ?? {};

      if (created) {
        // Only schema `public`; an unqualified name in these migrations means public.
        if ((createSchema ?? 'public').replace(/"/g, '') !== 'public') continue;
        if (!live.has(created)) live.set(created, file);
      } else if (dropped) {
        live.delete(dropped);
      } else if (renameFrom && renameTo) {
        if (live.delete(renameFrom)) live.set(renameTo, file);
      }
    }
  }

  return live;
}

const contractSql = readFileSync(CONTRACT_SQL, 'utf8');

/** Section A's `expected(tbl, authenticated, anon, service_role)` VALUES list. */
const contractGrantRows = new Set(
  [
    ...contractSql
      .split('WITH expected(tbl, authenticated, anon, service_role) AS (VALUES')[1]
      .split('\n  )')[0]
      .matchAll(/^\s*\('([a-z_]+)','[^']*','[^']*','[^']*'\),?\s*$/gm),
  ].map(match => match[1])
);

/** The `relname NOT IN (...)` completeness list that guards section A. */
const contractCompletenessList = new Set(
  [
    ...contractSql
      .split('AND c.relname NOT IN (')[1]
      .split('    );')[0]
      .matchAll(/'([a-z_]+)'/g),
  ].map(match => match[1])
);

const liveTables = tablesSurvivingMigrations();

describe('every migration-created public table is declared in all three ACL registries', () => {
  it('parses the migrations and both SQL lists at all', () => {
    // A silently-empty parse would make every assertion below vacuously true —
    // the exact failure this file exists to prevent, one level up.
    expect(liveTables.size).toBeGreaterThan(100);
    expect(contractGrantRows.size).toBeGreaterThan(100);
    expect(contractCompletenessList.size).toBeGreaterThan(100);
    expect(Object.keys(AUTHENTICATED_TABLE_GRANTS).length).toBeGreaterThan(100);
  });

  it('drops and renames are honoured, so dead tables are not demanded', () => {
    // Both halves of migration 130. Without the rename branch `registrations`
    // would be reported missing from every registry, forever.
    expect(liveTables.has('registrations')).toBe(false);
    expect(liveTables.has('enrollments')).toBe(true);
  });

  it('prose is not mistaken for DDL', () => {
    // See stripSqlComments: these are words that follow "CREATE TABLE" inside
    // comments in 103_drop_duplicate_visibility_tables.sql and
    // 20260704120000_create_system_health_snapshots.sql.
    expect(liveTables.has('made')).toBe(false);
    expect(liveTables.has('needs')).toBe(false);
  });

  it('appears in the SQL grant contract (section A)', () => {
    const missing = [...liveTables]
      .filter(([table]) => !contractGrantRows.has(table))
      .map(([table, file]) => `${table} (created in ${file})`);

    expect(missing, "add a row to pre_rule_table_grants_test.sql's expected(...) VALUES").toEqual(
      []
    );
  });

  it('appears in the SQL contract completeness list', () => {
    const missing = [...liveTables]
      .filter(([table]) => !contractCompletenessList.has(table))
      .map(([table, file]) => `${table} (created in ${file})`);

    expect(
      missing,
      'add it to the relname NOT IN (...) list in pre_rule_table_grants_test.sql'
    ).toEqual([]);
  });

  it('appears in AUTHENTICATED_TABLE_GRANTS', () => {
    const missing = [...liveTables]
      .filter(([table]) => !(table in AUTHENTICATED_TABLE_GRANTS))
      .map(([table, file]) => `${table} (created in ${file})`);

    // '' is the right value for a table authenticated cannot reach — the map
    // must still list it, because appliedAclChecks.test.ts asserts the map and
    // the SQL contract cover exactly the same tables.
    expect(missing, 'add it to AUTHENTICATED_TABLE_GRANTS in appliedAclChecks.ts').toEqual([]);
  });

  it('does not require the reverse — three contract tables predate the migrations', () => {
    // `classes`, `entries` and `show_message_threads` are in the registries but
    // are never CREATEd by any migration, so this test deliberately checks only
    // one direction. Asserting equality would fail on day one and would have to
    // carry an exception list that rots.
    const contractOnly = [...contractGrantRows].filter(table => !liveTables.has(table));

    expect(contractOnly.sort()).toEqual(['classes', 'entries', 'show_message_threads']);
  });
});
