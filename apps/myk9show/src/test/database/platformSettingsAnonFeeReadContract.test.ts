/**
 * MYK9-229 — anon must be able to read the platform fee, and ONLY the fee.
 *
 * The public /fees page states the live service fee to a signed-out visitor.
 * Before this migration anon was blocked at BOTH layers — no column privilege
 * and no RLS policy — and the page silently fell back to the compiled-in
 * defaults. Those defaults equal the live values today, which is precisely what
 * made the gap invisible: the page was right by coincidence and would have gone
 * quietly wrong the first time a site admin changed the rate.
 *
 * Grants and RLS are orthogonal here. A migration with only the GRANT still
 * 403s (no policy admits the row); one with only the policy still 403s (no
 * privilege on the columns). Both halves are asserted separately below, so
 * deleting either one fails this file rather than shipping a fix that does
 * nothing.
 *
 * This reads the migration TEXT, which is the half a fast test can see. The
 * other half — what the applied database actually holds — is the /admin/health
 * `anon_grants` check (ANON_COLUMN_ALLOWLIST in _shared/anonGrantChecks.ts) and
 * supabase/tests/pre_rule_table_grants_test.sql. All three must agree.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = resolve(__dirname, '../../../../../supabase/migrations');

const FEE_COLUMNS = [
  'platform_fee_percent',
  'platform_fee_flat_cents',
  'platform_fee_min_cents',
] as const;

/** Columns on this table anon must never reach. */
const WITHHELD_COLUMNS = ['updated_by', 'updated_at'] as const;

function migrations(): { filename: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter(name => name.endsWith('.sql'))
    .sort()
    .map(filename => ({
      filename,
      sql: readFileSync(resolve(MIGRATIONS_DIR, filename), 'utf8'),
    }));
}

/** Statements with SQL comments stripped, so prose can never satisfy a match. */
function statements(sql: string): string[] {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .split(';')
    .map(statement => statement.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const ALL_STATEMENTS = migrations().flatMap(m =>
  statements(m.sql).map(statement => ({ filename: m.filename, statement }))
);

const PLATFORM_SETTINGS = /(?:public\.)?platform_settings\b/i;

/** Every anon column-SELECT grant on platform_settings, as a flat column list. */
function anonColumnGrants(): string[] {
  const columns: string[] = [];
  for (const { statement } of ALL_STATEMENTS) {
    const match = statement.match(
      /^GRANT\s+SELECT\s*\(([^)]*)\)\s+ON\s+(?:TABLE\s+)?(?:public\.)?platform_settings\s+TO\s+(.+)$/i
    );
    if (!match || !/\banon\b/i.test(match[2])) continue;
    columns.push(...match[1].split(',').map(column => column.trim().toLowerCase()));
  }
  return columns;
}

describe('platform_settings — the evaluator itself', () => {
  it('sees the migration corpus at all', () => {
    expect(ALL_STATEMENTS.length).toBeGreaterThan(1000);
    expect(
      ALL_STATEMENTS.some(({ statement }) => PLATFORM_SETTINGS.test(statement)),
      'no statement mentions platform_settings — the parser is broken, not the ACL'
    ).toBe(true);
  });
});

describe('barrier 1 — anon column privileges on platform_settings', () => {
  it('grants SELECT on exactly the three fee columns', () => {
    expect(anonColumnGrants().sort()).toEqual([...FEE_COLUMNS].sort());
  });

  it('never grants anon a column it has no business reading', () => {
    for (const column of WITHHELD_COLUMNS) {
      expect(anonColumnGrants(), `anon must not reach platform_settings.${column}`).not.toContain(
        column
      );
    }
  });

  it('never grants anon TABLE-level access, which would hand over every column', () => {
    const tableGrants = ALL_STATEMENTS.filter(({ statement }) => {
      const match = statement.match(
        /^GRANT\s+(?!SELECT\s*\()([^;]+?)\s+ON\s+(?:TABLE\s+)?(?:public\.)?platform_settings\s+TO\s+(.+)$/i
      );
      return match ? /\banon\b/i.test(match[2]) : false;
    });
    expect(tableGrants.map(g => `${g.filename}: ${g.statement}`)).toEqual([]);
  });

  it('never grants anon a write privilege by any route', () => {
    const writes = ALL_STATEMENTS.filter(({ statement }) => {
      if (!/^GRANT\b/i.test(statement) || !PLATFORM_SETTINGS.test(statement)) return false;
      if (!/\bTO\s+[^;]*\banon\b/i.test(statement)) return false;
      return /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALL)\b/i.test(statement.split(/\bON\b/i)[0]);
    });
    expect(writes.map(w => `${w.filename}: ${w.statement}`)).toEqual([]);
  });
});

describe('barrier 2 — an RLS SELECT policy admitting anon', () => {
  it('creates one, without which the grant alone still 403s', () => {
    const policies = ALL_STATEMENTS.filter(
      ({ statement }) =>
        /^CREATE\s+POLICY\b/i.test(statement) &&
        /\bON\s+(?:public\.)?platform_settings\b/i.test(statement) &&
        /\bFOR\s+SELECT\b/i.test(statement) &&
        /\bTO\s+[^;]*\banon\b/i.test(statement)
    );
    expect(policies.length).toBeGreaterThan(0);
  });

  it('does not widen the existing authenticated policies to anon', () => {
    // platform_settings_update must stay authenticated-only: a public page
    // needs to READ the fee, never to change it.
    const updatePolicies = ALL_STATEMENTS.filter(
      ({ statement }) =>
        /^CREATE\s+POLICY\b/i.test(statement) &&
        /\bON\s+(?:public\.)?platform_settings\b/i.test(statement) &&
        /\bFOR\s+(?:UPDATE|INSERT|DELETE|ALL)\b/i.test(statement)
    );
    expect(updatePolicies.length).toBeGreaterThan(0);
    for (const policy of updatePolicies) {
      expect(
        /\bTO\s+[^;]*\banon\b/i.test(policy.statement),
        `${policy.filename} lets anon write platform_settings`
      ).toBe(false);
    }
  });

  it('leaves RLS enabled on the table', () => {
    expect(
      ALL_STATEMENTS.some(({ statement }) =>
        /^ALTER\s+TABLE\s+(?:public\.)?platform_settings\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY$/i.test(
          statement
        )
      )
    ).toBe(true);
    expect(
      ALL_STATEMENTS.some(({ statement }) =>
        /^ALTER\s+TABLE\s+(?:public\.)?platform_settings\s+DISABLE\s+ROW\s+LEVEL\s+SECURITY$/i.test(
          statement
        )
      )
    ).toBe(false);
  });
});
