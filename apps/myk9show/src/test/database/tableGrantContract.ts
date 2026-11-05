import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Parser for the CI-enforced table-grant contract in
 * `supabase/tests/pre_rule_table_grants_test.sql` (section A's
 * `expected(tbl, authenticated, anon, service_role)` VALUES list).
 *
 * Shared by `aclRegistryCoverage.test.ts` and the PostgREST embed-grants guard
 * so the contract is parsed in exactly one place.
 */

const REPO_ROOT = resolve(__dirname, '../../../../..');
export const CONTRACT_SQL_PATH = resolve(
  REPO_ROOT,
  'supabase/tests/pre_rule_table_grants_test.sql'
);

export interface TableGrantRow {
  authenticated: string;
  anon: string;
  serviceRole: string;
}

export function readContractSql(): string {
  return readFileSync(CONTRACT_SQL_PATH, 'utf8');
}

/** table name -> privileges (comma lists) the contract expects per role. */
export function parseContractGrantRows(contractSql: string): Map<string, TableGrantRow> {
  const body = contractSql
    .split('WITH expected(tbl, authenticated, anon, service_role) AS (VALUES')[1]
    .split('\n  )')[0];
  const rows = new Map<string, TableGrantRow>();
  for (const m of body.matchAll(/^\s*\('([a-z_]+)','([^']*)','([^']*)','([^']*)'\),?\s*$/gm)) {
    rows.set(m[1], { authenticated: m[2], anon: m[3], serviceRole: m[4] });
  }
  return rows;
}

export function hasTableSelect(privileges: string): boolean {
  return privileges.split(',').includes('SELECT');
}

/**
 * Section C's `expected(tbl, role_name, n)` list: (table, role) pairs that hold
 * COLUMN-level grants (n > 0) rather than a table-level one. Keys are
 * `table:role`. PostgREST embeds that name explicit columns work on such a table.
 */
export function parseColumnGrantRows(contractSql: string): Set<string> {
  const body = contractSql
    .split('WITH expected(tbl, role_name, n) AS (VALUES')[1]
    .split('\n    )')[0];
  const out = new Set<string>();
  for (const m of body.matchAll(/^\s*\('([a-z_]+)','([a-z_]+)',(\d+)\)/gm)) {
    if (Number(m[3]) > 0) out.add(`${m[1]}:${m[2]}`);
  }
  return out;
}
