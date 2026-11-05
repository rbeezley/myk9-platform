// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  hasTableSelect,
  parseColumnGrantRows,
  parseContractGrantRows,
  readContractSql,
  type TableGrantRow,
} from '../database/tableGrantContract';
import { extractEmbeds, findEmbedSites } from './postgrestEmbedGrants';

/**
 * Guard for LESSON postgrest-embed-grants (MYK9-1711, split from MYK9-1654).
 *
 * PostgREST needs table-level SELECT on every EMBEDDED relation: revoking a
 * role on a table only ever reached through `table(col,...)` embeds turns a
 * null embed into a hard 42501 that fails the whole request.
 *
 * For each `.from('<base>').select('...embed(...)...')` in app/package source,
 * every role {anon, authenticated} that can SELECT the base must also be able
 * to SELECT the embedded table, per the CI-enforced contract in
 * supabase/tests/pre_rule_table_grants_test.sql (section A table-level grants,
 * section C column-level grants). A (table, role) pair with column grants is
 * accepted: the embeds here name explicit columns. The base table's own grant
 * is the proxy for "which roles run this query": a role that cannot read the
 * base cannot run it at all.
 */

const REPO_ROOT = resolve(__dirname, '../../../../..');

type Role = 'anon' | 'authenticated';
const ROLES: Role[] = ['anon', 'authenticated'];

interface Violation {
  site: string;
  base: string;
  embed: string;
  role: Role;
}

function violationsIn(
  files: Record<string, string>,
  contract: Map<string, TableGrantRow>,
  columnGranted: Set<string>,
  unresolvable: ReadonlySet<string> = new Set()
): { violations: Violation[]; unknown: string[]; embedCount: number } {
  const violations: Violation[] = [];
  const unknown = new Set<string>();
  let embedCount = 0;
  for (const [file, src] of Object.entries(files)) {
    for (const { line, base, embed } of findEmbedSites(src, file)) {
      embedCount++;
      const e = contract.get(embed);
      if (!e) {
        if (!unresolvable.has(embed)) unknown.add(`${file}:${line} ${base} > ${embed}`);
        continue;
      }
      const b = contract.get(base);
      if (!b) continue; // a view or unknown base: nothing to compare against
      for (const role of ROLES) {
        if (
          hasTableSelect(b[role]) &&
          !hasTableSelect(e[role]) &&
          !columnGranted.has(`${embed}:${role}`)
        ) {
          violations.push({ site: `${file}:${line}`, base, embed, role });
        }
      }
    }
  }
  return { violations, unknown: [...unknown].sort(), embedCount };
}

/**
 * Embed names that are not contract tables, so they cannot be checked: each is
 * a PostgREST FK-column hint, whose target table this guard cannot resolve
 * without a schema. Listed rather than silently passed; a new unresolvable
 * name fails the scan until it is added here with a reason.
 */
const UNRESOLVABLE_EMBEDS: ReadonlySet<string> = new Set([
  'dog_id', // FK-column hint on entries / stripe_orders
  'class_id', // FK-column hint on entries
  'owner_id', // FK-column hint on entries
  'show_id', // FK-column hint on entries / stripe_orders
  'trial_id', // FK-column hint on entries
  'registration_id', // FK-column hint on entries
  'changed_by', // FK-column hint on entry_status_history
]);

const row = (anon: string, authenticated: string): TableGrantRow => ({
  anon,
  authenticated,
  serviceRole: '',
});
const FIXTURE = new Map<string, TableGrantRow>([
  ['shows', row('SELECT', 'SELECT')],
  ['clubs', row('SELECT', 'SELECT')],
  ['secrets', row('', 'SELECT')],
]);
const check = (src: string, columnGranted: string[] = []) =>
  violationsIn({ 'a.ts': src }, FIXTURE, new Set(columnGranted));

describe('postgrest embed grants guard: known answers', () => {
  it('flags an embed lacking SELECT for a role that reads the base', () => {
    expect(check(`db.from('shows').select('id, secrets(name)');`).violations).toEqual([
      { site: 'a.ts:1', base: 'shows', embed: 'secrets', role: 'anon' },
    ]);
  });

  it('passes when base and embed both grant SELECT to the role', () => {
    expect(check(`db.from('shows').select('id, clubs(name)');`).violations).toEqual([]);
  });

  it('does not flag a role that cannot read the base', () => {
    expect(check(`db.from('secrets').select('id, shows(name)');`).violations).toEqual([]);
  });

  it('accepts a column-granted embed target', () => {
    expect(
      check(`db.from('shows').select('id, secrets(name)');`, ['secrets:anon']).violations
    ).toEqual([]);
  });

  it('extracts nested, !inner, !fk_hint and alias:name embeds', () => {
    expect(extractEmbeds('id, a(x, b(y, c!inner(z))), d!fk_hint(q), al:e(w), f!inner(v)')).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
    ]);
    expect(
      check(`db.from('shows').select('id, x:clubs(n, y:secrets!inner(m))');`).violations
    ).toEqual([{ site: 'a.ts:1', base: 'shows', embed: 'secrets', role: 'anon' }]);
  });

  it('reads multi-line template literals and same-file string constants', () => {
    const tpl = "db.from('shows')\n  .select(`\n id,\n secrets (\n name\n )\n`);";
    expect(check(tpl).violations).toHaveLength(1);
    const viaConst = `const COLS = 'id, secrets(name)';\ndb.from('shows').eq('a', 1).select(COLS);`;
    expect(check(viaConst).violations).toHaveLength(1);
  });

  it('does not mistake plain columns, count aggregates or casts for embeds', () => {
    expect(extractEmbeds('id, name, created_at::text, data->>k')).toEqual([]);
    expect(extractEmbeds('id, count()')).toEqual([]);
    expect(extractEmbeds('id, clubs(name), qty:count(), total:amount.sum()')).toEqual(['clubs']);
    expect(check(`db.from('shows').select('id, count()');`).violations).toEqual([]);
  });

  it('reports an embed that is neither a contract table nor allowlisted', () => {
    expect(check(`db.from('shows').select('id, mystery(name)');`).unknown).toEqual([
      'a.ts:1 shows > mystery',
    ]);
  });

  it('ignores a select with no .from chain', () => {
    expect(findEmbedSites(`const s = 'a(b)'; x.select('a(b)');`)).toEqual([]);
  });
});

describe('postgrest embed grants guard: repository', () => {
  it('every embed target is readable by the roles that read its base table', () => {
    const tracked = execFileSync(
      'git',
      ['ls-files', '-z', '--', 'apps/myk9show/src', 'packages/*/src'],
      { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    )
      .split('\0')
      .filter(f => /\.tsx?$/.test(f) && !/\.(test|spec)\.tsx?$/.test(f) && !f.includes('/test/'));

    const files: Record<string, string> = {};
    for (const rel of tracked) {
      let src: string;
      try {
        src = readFileSync(resolve(REPO_ROOT, rel), 'utf8');
      } catch {
        continue; // tracked but deleted in the working tree
      }
      if (src.includes('.select(')) files[rel] = src; // prefilter before the AST parse
    }

    const contractSql = readContractSql();
    const contract = parseContractGrantRows(contractSql);
    expect(contract.size).toBeGreaterThan(100);
    const columnGranted = parseColumnGrantRows(contractSql);
    expect(columnGranted.has('classes:anon')).toBe(true); // positive control

    const { violations, unknown, embedCount } = violationsIn(
      files,
      contract,
      columnGranted,
      UNRESOLVABLE_EMBEDS
    );
    // Positive control: 220 real embeds were found when this guard was written.
    expect(embedCount).toBeGreaterThan(150);
    expect(unknown, 'add to UNRESOLVABLE_EMBEDS with a reason, or fix the select').toEqual([]);
    expect(
      violations.map(v => `${v.site}: ${v.base} > ${v.embed} lacks SELECT for ${v.role}`)
    ).toEqual([]);
  });
});
