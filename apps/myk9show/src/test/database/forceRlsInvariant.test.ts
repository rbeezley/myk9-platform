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
  '20260711170000_force_rls_go_live_gap.sql'
);
const liveVerifier = resolve(repoRoot, 'scripts/qa/db-security/force-rls-live.sql');

function maskSqlNonCode(sql: string): string {
  let masked = '';
  let index = 0;

  const maskCharacter = (character: string): string =>
    character === '\n' || character === '\r' ? character : ' ';

  while (index < sql.length) {
    if (sql.startsWith('--', index)) {
      while (index < sql.length && sql[index] !== '\n') {
        masked += ' ';
        index += 1;
      }
      continue;
    }

    if (sql.startsWith('/*', index)) {
      let depth = 1;
      masked += '  ';
      index += 2;

      while (index < sql.length && depth > 0) {
        if (sql.startsWith('/*', index)) {
          depth += 1;
          masked += '  ';
          index += 2;
        } else if (sql.startsWith('*/', index)) {
          depth -= 1;
          masked += '  ';
          index += 2;
        } else {
          masked += maskCharacter(sql[index]);
          index += 1;
        }
      }
      continue;
    }

    if (sql[index] === "'") {
      const priorCharacter = sql[index - 1];
      const characterBeforePrefix = sql[index - 2];
      const allowsBackslashEscapes =
        priorCharacter?.toLowerCase() === 'e' &&
        (!characterBeforePrefix || !/[a-z0-9_$]/i.test(characterBeforePrefix));

      masked += ' ';
      index += 1;

      while (index < sql.length) {
        if (sql[index] === "'" && sql[index + 1] === "'") {
          masked += '  ';
          index += 2;
        } else if (
          allowsBackslashEscapes &&
          sql[index] === '\\' &&
          index + 1 < sql.length
        ) {
          masked += '  ';
          index += 2;
        } else if (sql[index] === "'") {
          masked += ' ';
          index += 1;
          break;
        } else {
          masked += maskCharacter(sql[index]);
          index += 1;
        }
      }
      continue;
    }

    if (sql[index] === '$') {
      const delimiter = sql.slice(index).match(/^\$(?:[a-z_][a-z0-9_]*)?\$/i)?.[0];
      if (delimiter) {
        const closingIndex = sql.indexOf(delimiter, index + delimiter.length);
        const endIndex = closingIndex === -1 ? sql.length : closingIndex + delimiter.length;

        while (index < endIndex) {
          masked += maskCharacter(sql[index]);
          index += 1;
        }
        continue;
      }
    }

    if (sql[index] === '"') {
      masked += '"';
      index += 1;

      while (index < sql.length) {
        if (sql[index] === '"' && sql[index + 1] === '"') {
          masked += '""';
          index += 2;
        } else if (sql[index] === '"') {
          masked += '"';
          index += 1;
          break;
        } else {
          masked += sql[index] === ';' ? ' ' : sql[index];
          index += 1;
        }
      }
      continue;
    }

    masked += sql[index];
    index += 1;
  }

  return masked;
}

function executableSqlStatements(sql: string): string[] {
  return maskSqlNonCode(sql)
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean);
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
    for (const sql of executableSqlStatements(source.sql)) {
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

  it('ignores DDL text inside quoted and dollar-quoted function bodies', () => {
    const sources = [
      {
        name: '001_function_body.sql',
        sql: `
          CREATE TABLE public.real_table (id uuid);
          ALTER TABLE public.real_table ENABLE ROW LEVEL SECURITY;

          CREATE FUNCTION public.fake_force() RETURNS void
          LANGUAGE plpgsql
          AS $function$
          BEGIN
            EXECUTE 'ALTER TABLE public.real_table FORCE ROW LEVEL SECURITY;';
          END;
          $function$;
        `,
      },
    ];

    expect(unforcedRlsTables(sources)).toEqual(['real_table']);
  });

  it('does not treat comment markers inside string literals as comments', () => {
    const sources = [
      {
        name: '001_literal_comments.sql',
        sql: `
          CREATE TABLE public.literal_comment_table (id uuid);
          SELECT '-- still a string'; ALTER TABLE public.literal_comment_table ENABLE ROW LEVEL SECURITY;
          SELECT '/* still a string */';
        `,
      },
    ];

    expect(unforcedRlsTables(sources)).toEqual(['literal_comment_table']);
  });

  it('does not treat a standard-string backslash as a quote escape', () => {
    const sources = [
      {
        name: '001_standard_string.sql',
        sql: `
          CREATE TABLE public.standard_string_table (id uuid);
          SELECT '\\'; ALTER TABLE public.standard_string_table ENABLE ROW LEVEL SECURITY;
        `,
      },
    ];

    expect(unforcedRlsTables(sources)).toEqual(['standard_string_table']);
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
