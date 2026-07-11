import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type TableSecurityState = {
  rlsEnabled: boolean;
  rlsForced: boolean;
};

type MigrationSource = {
  name: string;
  sql: string;
};

const repoRoot = resolve(__dirname, '../../../../..');
const migrationsDir = resolve(repoRoot, 'supabase/migrations');
const remediationMigration = resolve(
  migrationsDir,
  '20260711150000_force_rls_go_live_gap.sql'
);
const liveVerifier = resolve(repoRoot, 'scripts/qa/db-security/force-rls-live.sql');

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '');
}

function publicTableName(reference: string): string | null {
  const parts = reference
    .replaceAll('"', '')
    .toLowerCase()
    .split('.');

  if (parts.length === 1) return parts[0];
  return parts[0] === 'public' ? parts[1] : null;
}

function deriveTableSecurityState(sources: MigrationSource[]): Map<string, TableSecurityState> {
  const states = new Map<string, TableSecurityState>();
  const tableReference = '(?:"?[a-z_][a-z0-9_]*"?\\.)?"?[a-z_][a-z0-9_]*"?';

  for (const source of sources) {
    const sql = stripSqlComments(source.sql);
    const operations: Array<{ index: number; apply: () => void }> = [];

    const createPattern = new RegExp(
      `\\bcreate\\s+(?:unlogged\\s+)?table\\s+(?:if\\s+not\\s+exists\\s+)?(${tableReference})`,
      'gi'
    );
    for (const match of sql.matchAll(createPattern)) {
      const table = publicTableName(match[1]);
      if (!table) continue;
      operations.push({
        index: match.index,
        apply: () => {
          if (!states.has(table)) {
            states.set(table, { rlsEnabled: false, rlsForced: false });
          }
        },
      });
    }

    const dropPattern = new RegExp(
      `\\bdrop\\s+table\\s+(?:if\\s+exists\\s+)?(${tableReference})`,
      'gi'
    );
    for (const match of sql.matchAll(dropPattern)) {
      const table = publicTableName(match[1]);
      if (!table) continue;
      operations.push({ index: match.index, apply: () => states.delete(table) });
    }

    const alterPattern = new RegExp(
      `\\balter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?(${tableReference})\\s+(enable|disable|force|no\\s+force)\\s+row\\s+level\\s+security`,
      'gi'
    );
    for (const match of sql.matchAll(alterPattern)) {
      const table = publicTableName(match[1]);
      if (!table) continue;
      const action = match[2].replace(/\s+/g, ' ').toLowerCase();
      operations.push({
        index: match.index,
        apply: () => {
          const state = states.get(table) ?? { rlsEnabled: false, rlsForced: false };
          if (action === 'enable') state.rlsEnabled = true;
          if (action === 'disable') state.rlsEnabled = false;
          if (action === 'force') state.rlsForced = true;
          if (action === 'no force') state.rlsForced = false;
          states.set(table, state);
        },
      });
    }

    operations.sort((a, b) => a.index - b.index).forEach(operation => operation.apply());
  }

  return states;
}

function unforcedRlsTables(sources: MigrationSource[]): string[] {
  return [...deriveTableSecurityState(sources)]
    .filter(([, state]) => state.rlsEnabled && !state.rlsForced)
    .map(([table]) => table)
    .sort();
}

function repositoryMigrations(): MigrationSource[] {
  return readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort()
    .map(file => ({ name: file, sql: readFileSync(resolve(migrationsDir, file), 'utf8') }));
}

describe('FORCE RLS migration invariant', () => {
  it('detects a future public table that enables RLS without forcing it', () => {
    const sources = [
      {
        name: '001_future.sql',
        sql: `
          CREATE TABLE public.future_table (id uuid);
          ALTER TABLE public.future_table ENABLE ROW LEVEL SECURITY;
        `,
      },
    ];

    expect(unforcedRlsTables(sources)).toEqual(['future_table']);
  });

  it('accepts unqualified public tables that are subsequently forced', () => {
    const sources = [
      {
        name: '001_create.sql',
        sql: `
          CREATE TABLE IF NOT EXISTS later_forced (id uuid);
          ALTER TABLE later_forced ENABLE ROW LEVEL SECURITY;
        `,
      },
      {
        name: '002_force.sql',
        sql: 'ALTER TABLE public.later_forced FORCE ROW LEVEL SECURITY;',
      },
    ];

    expect(unforcedRlsTables(sources)).toEqual([]);
  });

  it('honors disable, no-force, and drop operations in statement order', () => {
    const sources = [
      {
        name: '001_state.sql',
        sql: `
          CREATE TABLE public.disabled_table (id uuid);
          ALTER TABLE public.disabled_table ENABLE ROW LEVEL SECURITY;
          ALTER TABLE public.disabled_table DISABLE ROW LEVEL SECURITY;
          CREATE TABLE public.no_force_table (id uuid);
          ALTER TABLE public.no_force_table ENABLE ROW LEVEL SECURITY;
          ALTER TABLE public.no_force_table FORCE ROW LEVEL SECURITY;
          ALTER TABLE public.no_force_table NO FORCE ROW LEVEL SECURITY;
          CREATE TABLE public.dropped_table (id uuid);
          ALTER TABLE public.dropped_table ENABLE ROW LEVEL SECURITY;
          DROP TABLE IF EXISTS public.dropped_table;
        `,
      },
    ];

    expect(unforcedRlsTables(sources)).toEqual(['no_force_table']);
  });

  it('leaves no repository-owned RLS-enabled public table unforced', () => {
    expect(unforcedRlsTables(repositoryMigrations())).toEqual([]);
  });

  it('uses the dedicated remediation migration for the four extant July 11 gaps and rollback', () => {
    const sql = readFileSync(remediationMigration, 'utf8');
    const tables = [
      'secretary_tasks',
      'club_premium_templates',
      'premium_generations',
      'login_attempts',
    ];

    for (const table of tables) {
      expect(sql).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`);
      expect(sql).toContain(`ALTER TABLE public.${table} NO FORCE ROW LEVEL SECURITY;`);
    }

    expect(sql).not.toContain('ALTER TABLE public.unified_ringside_overrides');
  });

  it('keeps the live verifier read-only and scoped to unforced public RLS tables', () => {
    const sql = readFileSync(liveVerifier, 'utf8').toLowerCase();

    expect(sql).toContain('from pg_catalog.pg_class');
    expect(sql).toContain('join pg_catalog.pg_namespace');
    expect(sql).toContain('relrowsecurity');
    expect(sql).toContain('not c.relforcerowsecurity');
    expect(sql).toContain("n.nspname = 'public'");
    expect(sql).not.toMatch(/\b(insert|update|delete|alter|drop|create)\b/);
  });
});
