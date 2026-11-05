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
import { extractEmbeds, findEmbedSites, type ReadFile } from './postgrestEmbedGrants';

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
 *
 * "Reads the base" means table SELECT or a column grant on it (section C), so
 * show-day reads of column-granted bases (entries, classes, dogs, people,
 * judge_assignments) are checked too.
 *
 * `${CONST}` substitutions in a select resolve through string constants bound
 * at the top level of the same file or imported by a relative or `@/` path
 * (depth <= 3, cycle-safe); anything else is dropped, never a failure.
 *
 * Known limits: (1) section C records column COUNTS, not names, so a column
 * grant is taken to cover any column an embed names; (2) a nested embed
 * (`a(b(c))`) is checked against the top-level base's roles, not against `a`'s.
 * A call that provably never runs for a role goes in SITE_ALLOWLIST with the
 * evidence; a call anon really can run is a bug to fix in the database, never
 * an allowlist entry.
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

interface SiteAllow {
  file: string;
  base: string;
  embed: string;
  role: Role;
  /** The evidence the call never runs for this role. */
  reason: string;
}

/** Files by repo-relative path; a constant imported from one not in the scan set is read lazily. */
function violationsIn(
  files: Record<string, string>,
  contract: Map<string, TableGrantRow>,
  columnGranted: Set<string>,
  unresolvable: ReadonlySet<string> = new Set(),
  siteAllow: readonly SiteAllow[] = [],
  readFile: ReadFile = p => files[p]
): { violations: Violation[]; unknown: string[]; embedCount: number; unusedAllow: SiteAllow[] } {
  const violations: Violation[] = [];
  const used = new Set<SiteAllow>();
  const unknown = new Set<string>();
  let embedCount = 0;
  for (const [file, src] of Object.entries(files)) {
    for (const { line, base, embed: named, star } of findEmbedSites(src, file, readFile)) {
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
        // A role reads the base through table SELECT or through column grants (section C).
        const readsBase = hasTableSelect(b[role]) || columnGranted.has(`${base}:${role}`);
        const allowed = siteAllow.find(
          a => a.file === file && a.base === base && a.embed === embed && a.role === role
        );
        if (readsBase && !hasTableSelect(e[role]) && !servedByColumns) {
          if (allowed) {
            used.add(allowed);
            continue;
          }
          violations.push({ site: `${file}:${line}`, base, embed, role });
        }
      }
    }
  }
  return {
    violations,
    unknown: [...unknown].sort(),
    embedCount,
    unusedAllow: siteAllow.filter(a => !used.has(a)),
  };
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
  handler_id: 'people', // entries.handler_id (migration 003)
};

/** Embed names that cannot be checked at all. Empty: add one only with a reason. */
const UNRESOLVABLE_EMBEDS: ReadonlySet<string> = new Set<string>();

/**
 * Site-level exceptions: a call that provably never runs for the role. File +
 * base + embed + role only, never a blanket table entry, so a new call on the
 * same tables is still checked.
 */
const SITE_ALLOWLIST: readonly SiteAllow[] = [
  {
    file: 'apps/myk9show/src/hooks/useEntryEligibility.ts',
    base: 'dogs',
    embed: 'dog_registrations',
    role: 'anon',
    reason:
      'selects dogs.height and date_of_birth, outside the anon dogs columns; entry-form eligibility check',
  },
  {
    file: 'apps/myk9show/src/pages/onboarding/steps/StepDogs.tsx',
    base: 'dogs',
    embed: 'dog_registrations',
    role: 'anon',
    reason:
      'onboarding redirects to /sign-in without a user and the query is keyed on the people-row personId; anon has neither',
  },
  {
    file: 'apps/myk9show/src/services/database/classes/reads.ts',
    base: 'classes',
    embed: 'entries',
    role: 'anon',
    reason:
      'runs only inside the `session?.user && !session.user.is_anonymous` branch of postgrestGetClassById',
  },
  {
    file: 'apps/myk9show/src/services/database/dogs/dogDetailRead.ts',
    base: 'dogs',
    embed: 'health_records',
    role: 'anon',
    reason:
      'select star on dogs: anon holds only dogs(id, name, call_name, breed, image_url) column grants, so the base read is denied before the embed; the owner:people embed also names phone and address columns anon lacks',
  },
  {
    file: 'apps/myk9show/src/services/database/dogs/reads.ts',
    base: 'dogs',
    embed: 'dog_registrations',
    role: 'anon',
    reason:
      'updateDog and searchAllDogs: updateDog is a write needing auth, searchAllDogs is secretary-only and selects dogs `*`; both denied to anon on the base',
  },
  {
    file: 'apps/myk9show/src/services/database/judges/reads.ts',
    base: 'people',
    embed: 'judge_qualifications',
    role: 'anon',
    reason:
      'people.phone/street_address etc. in PEOPLE_MAPPER_COLUMNS are outside the anon people columns (id, first_name, last_name, email), so anon is denied on the base before the embed',
  },
  {
    file: 'apps/myk9show/src/services/database/users/reads.ts',
    base: 'people',
    embed: 'judge_qualifications',
    role: 'anon',
    reason:
      'people.phone/street_address etc. in PEOPLE_MAPPER_COLUMNS are outside the anon people columns (id, first_name, last_name, email), so anon is denied on the base before the embed',
  },
];

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

  it('checks a base the role reads only through column grants', () => {
    const src = `db.from('secrets').select('id, shows(name)');`; // authenticated-only SELECT base
    const withCols = (cols: string[]) =>
      violationsIn(
        { 'a.ts': `db.from('clubs').select('id, secrets(name)');` },
        new Map([...FIXTURE, ['clubs', row('', 'SELECT')]]),
        new Set(cols)
      ).violations;
    expect(withCols([])).toEqual([]); // anon has no access to clubs here: not checked
    expect(withCols(['clubs:anon'])).toEqual([
      { site: 'a.ts:1', base: 'clubs', embed: 'secrets', role: 'anon' },
    ]);
    expect(check(src).violations).toEqual([]);
  });

  it('a site allowlist entry suppresses exactly that site', () => {
    const allow: SiteAllow[] = [
      { file: 'a.ts', base: 'shows', embed: 'secrets', role: 'anon', reason: 'test' },
    ];
    const src = `db.from('shows').select('id, secrets(name)');`;
    const run = (files: Record<string, string>, a = allow) =>
      violationsIn(files, FIXTURE, new Set(), new Set(), a);
    expect(run({ 'a.ts': src })).toMatchObject({ violations: [], unusedAllow: [] });
    expect(run({ 'b.ts': src }).violations).toHaveLength(1); // other file
    expect(
      run({ 'a.ts': `db.from('shows').select('id, secrets(name), clubs(n)');` }).violations
    ).toEqual([]);
    expect(run({ 'a.ts': `db.from('clubs').select('id, secrets(name)');` }).violations).toEqual([
      { site: 'a.ts:1', base: 'clubs', embed: 'secrets', role: 'anon' },
    ]); // other base
    expect(run({ 'a.ts': `db.from('shows').select('id, clubs(n)');` }).unusedAllow).toEqual(allow);
  });

  it('resolves ${CONST} substitutions from the same file and from imports', () => {
    const files = {
      'src/a.ts': `import { EMBED } from './lib/c';\nimport { ALIASED as AL } from '@/b';\nconst LOCAL = 'secrets(name)';\ndb.from('shows').select(\`id, \${LOCAL}\`);\ndb.from('shows').select(\`id, \${EMBED}\`);\ndb.from('shows').select(\`id, \${AL}\`);`,
      'src/lib/c.ts': `export const EMBED = \`secrets(name)\`;`,
      'apps/myk9show/src/b.ts': `import { INNER } from './lib/c2';\nexport const ALIASED = \`x, \${INNER}\`;`,
      'apps/myk9show/src/lib/c2.ts': `export const INNER = 'secrets!inner(m)';`,
    };
    const lines = violationsIn(files, FIXTURE, new Set()).violations.map(v => v.site);
    expect(lines).toEqual(['src/a.ts:4', 'src/a.ts:5', 'src/a.ts:6']);
  });

  it('bounds constant resolution and survives import cycles and unresolvable names', () => {
    const files = {
      'a.ts': `import { A } from './b';\ndb.from('shows').select(\`id, \${A}, \${nope}, \${fn()}\`);`,
      'b.ts': `import { A as X } from './a';\nexport const A = \`\${X}\`;`,
    };
    expect(violationsIn(files, FIXTURE, new Set()).violations).toEqual([]);
    // Four import hops is past the depth bound: the embed is not seen.
    const deep = {
      'a.ts': `import { C1 } from './c1';\ndb.from('shows').select(\`id, \${C1}\`);`,
      'c1.ts': `import { C2 } from './c2';\nexport const C1 = \`\${C2}\`;`,
      'c2.ts': `import { C3 } from './c3';\nexport const C2 = \`\${C3}\`;`,
      'c3.ts': `import { C4 } from './c4';\nexport const C3 = \`\${C4}\`;`,
      'c4.ts': `export const C4 = 'secrets(n)';`,
    };
    expect(violationsIn(deep, FIXTURE, new Set()).violations).toEqual([]);
    expect(
      violationsIn({ ...deep, 'c3.ts': `export const C3 = 'secrets(n)';` }, FIXTURE, new Set())
        .violations
    ).toHaveLength(1);
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

    const readRepoFile: ReadFile = rel => {
      try {
        return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
      } catch {
        return undefined;
      }
    };
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

    const { violations, unknown, embedCount, unusedAllow } = violationsIn(
      files,
      contract,
      columnGranted,
      UNRESOLVABLE_EMBEDS,
      SITE_ALLOWLIST,
      rel => files[rel] ?? readRepoFile(rel)
    );
    // Positive control: 220 embeds before constant resolution, 266 after.
    expect(embedCount).toBeGreaterThan(250);
    expect(unknown, 'add to UNRESOLVABLE_EMBEDS with a reason, or fix the select').toEqual([]);
    expect(unusedAllow, 'stale SITE_ALLOWLIST entry: remove it').toEqual([]);
    expect(
      violations.map(v => `${v.site}: ${v.base} > ${v.embed} lacks SELECT for ${v.role}`)
    ).toEqual([]);
  });
});
