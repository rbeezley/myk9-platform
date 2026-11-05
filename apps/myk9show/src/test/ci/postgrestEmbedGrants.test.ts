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
    for (const { line, base, embed: named, star } of findEmbedSites(src, file)) {
      embedCount++;
      const embed = FK_HINT_TARGETS[named] ?? named;
      const e = contract.get(embed);
      if (!e) {
        if (!unresolvable.has(embed)) unknown.add(`${file}:${line} ${base} > ${embed}`);
        continue;
      }
      const b = contract.get(base);
      if (!b) continue; // a view or unknown base: nothing to compare against
      for (const role of ROLES) {
        // Column grants serve an embed that names its columns; `*` needs table-level SELECT.
        const servedByColumns = columnGranted.has(`${embed}:${role}`) && !star;
        if (hasTableSelect(b[role]) && !hasTableSelect(e[role]) && !servedByColumns) {
          violations.push({ site: `${file}:${line}`, base, embed, role });
        }
      }
    }
  }
  return { violations, unknown: [...unknown].sort(), embedCount };
}

/**
 * PostgREST FK-column hints used as embed names (`dog:dog_id(...)`), resolved to
 * the table their foreign key targets so the embed is checked, not skipped.
 * Read from pg_constraint on 2026-11-05 for the bases that use them (entries,
 * stripe_orders, entry_status_history, and dogs for owner_id). A new hint name
 * fails the scan as "not in contract" until it is mapped here.
 */
const FK_HINT_TARGETS: Readonly<Record<string, string>> = {
  dog_id: 'dogs',
  class_id: 'classes',
  owner_id: 'people', // dogs.owner_id; other tables' owner_id point at auth.users
  show_id: 'shows',
  trial_id: 'trials',
  registration_id: 'enrollments',
  changed_by: 'people', // entry_status_history.changed_by
};

/** Embed names that cannot be checked at all. Empty: add one only with a reason. */
const UNRESOLVABLE_EMBEDS: ReadonlySet<string> = new Set<string>();

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

  it('accepts a column-granted embed target that names its columns', () => {
    expect(
      check(`db.from('shows').select('id, secrets(name)');`, ['secrets:anon']).violations
    ).toEqual([]);
  });

  it('flags `*` (or no columns) on a column-granted embed target', () => {
    const expected = [{ site: 'a.ts:1', base: 'shows', embed: 'secrets', role: 'anon' }];
    expect(
      check(`db.from('shows').select('id, secrets(*)');`, ['secrets:anon']).violations
    ).toEqual(expected);
    expect(check(`db.from('shows').select('id, secrets()');`, ['secrets:anon']).violations).toEqual(
      expected
    );
  });

  it('resolves an FK-column hint to the table it points at', () => {
    // shows_id is not a hint; show_id is, and resolves to shows.
    expect(check(`db.from('secrets').select('id, show:show_id(name)');`).unknown).toEqual([]);
    expect(
      violationsIn(
        { 'a.ts': `db.from('shows').select('id, x:dog_id(name)');` },
        new Map([...FIXTURE, ['dogs', row('', 'SELECT')]]),
        new Set()
      ).violations
    ).toEqual([{ site: 'a.ts:1', base: 'shows', embed: 'dogs', role: 'anon' }]);
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
