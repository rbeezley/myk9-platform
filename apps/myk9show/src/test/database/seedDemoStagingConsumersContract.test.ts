import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-text contract between supabase/seed-demo.sql (the LEAN reseed) and
 * every staging-facing consumer that needs specific seeded rows.
 *
 * MYK9-558 made the MYK9-109 load fixture opt-in (supabase/seed-load-fixture.sql).
 * Two review rounds each found consumers still pointing at load rows that a
 * plain reseed removes: the full-chip e2e, then the scheduled judge replay, the
 * cross-club scope spec, the dog picker, the secretary critical path and the
 * bulk-delete spec. This file makes that class of drift fail here instead of on
 * staging:
 *
 *   1. No e2e source or scheduled walk prompt may name a load-fixture id, load
 *      dog or load show, except the explicitly opt-in load diagnostics.
 *   2. Each retargeted consumer's ids and names resolve to lean-seed rows with
 *      the property the spec relies on.
 *
 * Source text only -- it proves the seed DECLARES the rows, not that staging
 * holds them. The seed's own postconditions and the specs are that proof.
 */

const repoRoot = resolve(__dirname, '../../../../..');
const read = (path: string) => readFileSync(join(repoRoot, path), 'utf8');
const stripSqlComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');

const seed = stripSqlComments(read('supabase/seed-demo.sql'));
const E2E = 'apps/myk9show/src/test/e2e';
const spec = (path: string) => read(`${E2E}/${path}`);

/** A string constant's literal value from spec source. */
function constOf(source: string, name: string): string {
  const m = new RegExp(`const ${name}\\s*=\\s*'([^']+)'`).exec(source);
  expect(m, `const ${name} not found`).not.toBeNull();
  return m![1];
}

/** Tuples of every `INSERT INTO public.<table> (...) VALUES ...;` block, split on each leading id. */
function tuples(table: string): string[][] {
  const out: string[][] = [];
  const re = new RegExp(`INSERT INTO public\\.${table}\\s*\\([^)]*\\)\\s*VALUES([\\s\\S]*?);`, 'g');
  for (const block of seed.matchAll(re)) {
    const body = block[1];
    const starts = [...body.matchAll(/\(\s*'([0-9a-f-]{36})'/g)];
    starts.forEach((m, i) => {
      const end = i + 1 < starts.length ? starts[i + 1].index : body.length;
      const text = body.slice(m.index, end);
      out.push([...text.matchAll(/'([^']*)'/g)].map(v => v[1]).concat(text));
    });
  }
  return out;
}

const entries = tuples('entries'); // [id, dog, class, show, trial, ...]
const dogs = tuples('dogs'); // [id, name, call_name, breed, ...]
const classes = tuples('classes'); // [id, trial, name, ...]
const trials = tuples('trials'); // [id, show, ...]
const shows = tuples('shows'); // [id, name, ...]
const whole = (row: string[]) => row[row.length - 1];

const judgeBlock = (() => {
  const start = seed.indexOf('INSERT INTO public.judge_assignments');
  expect(start).toBeGreaterThan(-1);
  return seed.slice(start, seed.indexOf(';', start));
})();

const HEARTLAND_CLUB = 'dededede-0000-0000-0000-000000000001';

function walk(dir: string): string[] {
  return readdirSync(join(repoRoot, dir)).flatMap(name => {
    const path = `${dir}/${name}`;
    if (name === 'node_modules' || name === '__snapshots__') return [];
    return statSync(join(repoRoot, path)).isDirectory() ? walk(path) : [path];
  });
}

/** Opt-in diagnostics that run only against a target with the load fixture applied. */
const LOAD_DIAGNOSTICS = [`${E2E}/load-readiness.spec.ts`, `${E2E}/load-request-phases.spec.ts`];

describe('staging consumers of the lean demo seed (MYK9-558)', () => {
  it('no e2e source names a load-fixture id, dog or show outside the opt-in diagnostics', () => {
    const LOAD_REFERENCE =
      /a1090000-|\.\.\/load\/loadFixture|'Load \d|Load (Show|Club) \d|Green Country|Redbud Ridge|Blue Sky (K9|Scent)/;
    const offenders = walk(E2E)
      .filter(path => /\.(ts|tsx)$/.test(path) && !LOAD_DIAGNOSTICS.includes(path))
      .filter(path => {
        // Comments may record history ("this was Load Show 1"); code may not.
        const code = read(path)
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/[^\n]*/g, '');
        return LOAD_REFERENCE.test(code);
      })
      .map(path => relative(repoRoot, join(repoRoot, path)));
    expect(offenders).toEqual([]);
  });

  it('keeps the load diagnostics opt-in, so a default run never reaches them', () => {
    for (const path of LOAD_DIAGNOSTICS) {
      expect(read(path)).toContain(
        "test.skip(process.env.LOAD_READINESS_DIAGNOSTIC !== 'true', 'Explicit diagnostic opt-in required');"
      );
    }
  });

  it('keeps load-fixture ids out of the scheduled walk prompts', () => {
    // The prompts moved to docs/qa/walks/ (MYK9-733); the operations doc keeps
    // only the pointers. Scan both, so a prompt cannot drift back onto the
    // opt-in load fixture from either home.
    expect(read('docs/operations/scheduled-task-walks.md')).not.toMatch(/a1090000-|Green Country/);
    const walkPrompts = walk('docs/qa/walks').filter(path => path.endsWith('.md'));
    expect(walkPrompts.length).toBeGreaterThanOrEqual(4);
    for (const path of walkPrompts) {
      expect(read(path), path).not.toMatch(/a1090000-|Green Country/);
    }
  });

  it('judge replay: the unassigned entry is a lean entry in a class no judge is assigned to', () => {
    const source = spec('show/atShowJudgeScoring.spec.ts');
    const showId = constOf(source, 'SHOW_ID');
    const unassignedClass = constOf(source, 'UNASSIGNED_CLASS_ID');
    const unassignedEntry = constOf(source, 'UNASSIGNED_ENTRY_ID');
    const row = entries.find(e => e[0] === unassignedEntry);
    expect(row, `${unassignedEntry} is not a seed-demo.sql entry`).toBeDefined();
    expect(row![2]).toBe(unassignedClass);
    expect(row![3]).toBe(showId);
    expect(judgeBlock).not.toContain(unassignedClass);
  });

  it('judge replay: the scored entry sits in an assigned class with another dog to advance to', () => {
    for (const path of ['show/atShowJudgeScoring.spec.ts', 'show/atShowJudgeAuditReplay.spec.ts']) {
      const source = spec(path);
      const classId = constOf(source, 'CLASS_ID');
      const entryId = constOf(source, 'ENTRY_ID');
      expect(judgeBlock, `${path}: ${classId} has no judge assignment`).toContain(classId);
      const inClass = entries.filter(e => e[2] === classId);
      expect(inClass.map(e => e[0])).toContain(entryId);
      // The quick-advance chip needs a second, unscored dog in the class.
      expect(inClass.length, `${path}: nothing to advance to in ${classId}`).toBeGreaterThanOrEqual(
        2
      );
    }
  });

  it('cross-club scope: the other-club class is a lean past show under a non-Heartland club', () => {
    const source = spec('club-admin/crossClubClassScope.spec.ts');
    const path = /const OTHER_CLUB_CLASS =\s*'([^']+)'\s*\+\s*'([^']+)'\s*\+\s*'([^']+)';/.exec(
      source
    );
    expect(path).not.toBeNull();
    const [showId, trialId, classId] = path!.slice(1).map(p => p.split('/').pop()!);

    const show = shows.find(s => s[0] === showId);
    expect(show, `${showId} is not a seed-demo.sql show`).toBeDefined();
    expect(whole(show!)).toMatch(/'dededede-0000-0000-0000-0000000000\d\d'/);
    expect(whole(show!)).not.toContain(`'${HEARTLAND_CLUB}'`);
    // In the past, so Find Shows' default upcoming view never lists it (MYK9-558).
    expect(whole(show!)).toMatch(/\(CURRENT_DATE - \d+\)::timestamp/);
    expect(whole(show!)).not.toMatch(/\(CURRENT_DATE \+ \d+\)/);
    expect(trials.find(t => t[0] === trialId)?.[1]).toBe(showId);
    expect(classes.find(c => c[0] === classId)?.[1]).toBe(trialId);
  });

  it('bulk delete: every refused dog is a lean dog with a paid entry, reachable by one search', () => {
    const source = spec('entities/dogsBulkDeleteBlocked.spec.ts');
    const names = /const BLOCKED_DOGS = \[([^\]]*)\]/.exec(source)![1].match(/'([^']+)'/g)!;
    const search = constOf(source, 'BLOCKED_DOGS_SEARCH').toLowerCase();
    expect(names.length).toBeGreaterThanOrEqual(2);
    for (const quoted of names) {
      const name = quoted.slice(1, -1);
      const dog = dogs.find(d => d[2] === name);
      expect(dog, `${name} is not a seeded dog call name`).toBeDefined();
      expect(dog![3].toLowerCase(), `${name}'s breed does not match "${search}"`).toContain(search);
      const paid = entries.filter(e => e[1] === dog![0] && /'[\w-]+',\s*'paid',/.test(whole(e)));
      expect(
        paid.length,
        `${name} has no paid lean entry, so its delete would NOT be refused`
      ).toBeGreaterThan(0);
    }
  });

  it('secretary critical path: the mail-in dog comes from the hermetic fixture, not the seed', () => {
    // MYK9-702 moved this spec onto installSecretaryFixture, so no reseed can
    // take its dog away. Pin that it still reads the dog from the fixture.
    const source = spec('uat/secretary/critical-path.spec.ts');
    expect(source).toMatch(
      /NON_OWNED_DOG_SEARCH[\s\S]*?from '\.\.\/\.\.\/helpers\/secretaryFixture'/
    );
    expect(source).not.toMatch(/const NON_OWNED_DOG_SEARCH\s*=/);
  });
});
