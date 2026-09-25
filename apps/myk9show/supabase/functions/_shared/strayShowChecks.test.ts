import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ENGINEERING_VOCABULARY,
  readListedShows,
  isSeedScopeShow,
  SEED_LOAD_SHOW_RANGE,
  SEED_SCOPE_SHOW_IDS,
  strayPublishedShowsCheck,
  strayShows,
} from './strayShowChecks';
import { buildSnapshot } from './systemHealthChecks';

/**
 * MYK9-741. A pattern that never matches passes every clean run, so its green
 * means nothing until it is shown to match the known offenders (LESSONS
 * measurement-harness). Both halves are pinned here: the MYK9-615 offender and
 * its siblings must match, and every name and location the reseed publishes
 * must not.
 */

const REPO = resolve(import.meta.dirname, '../../../../..');
const readRepo = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');

/** Known answers from MYK9-741: each must be flagged. */
const POSITIVE = [
  '[E2E MYK9-336] Past Due Payment Fixture',
  'Load 2 Trial 1',
  'MYK9-109 Load Show 3',
  '200 Load Fixture Way, Tulsa, OK 74101',
  'ZZ Audit Show',
];

/** Every show name and location the demo seed and the load fixture publish. */
const SEEDED = {
  'supabase/seed-demo.sql': [
    'Heartland Scent Work Classic',
    'Heartland UKC Nosework Trial',
    'Heartland ASCA Scent Detection Trial',
    'Prairie Trail Spring Scent Work Trial',
    '100 Dog Show Lane, Tulsa, OK 74101',
    '200 Prairie Road, Wichita, KS 67202',
  ],
  'supabase/seed-load-fixture.sql': [
    'Green Country Scent Work Trial',
    'Redbud Ridge Scent Work Classic',
    'Blue Sky Scent Work Weekend',
    // Rendered as `format('%s00 Fairgrounds Road, …', s)` for s = 1..3.
    '00 Fairgrounds Road, Tulsa, OK 74101',
  ],
};

describe('ENGINEERING_VOCABULARY', () => {
  it.each(POSITIVE)('flags %s (positive control)', text => {
    expect(ENGINEERING_VOCABULARY.test(text)).toBe(true);
  });

  it.each(Object.entries(SEEDED).flatMap(([file, texts]) => texts.map(t => [file, t] as const)))(
    '%s: never flags seeded text %s (negative control)',
    (file, text) => {
      // The fixture is only a control while the seed still publishes it.
      expect(readRepo(file)).toContain(text);
      expect(ENGINEERING_VOCABULARY.test(text)).toBe(false);
    }
  );

  it.each(['Loaded Scent Work Trial', 'Fixtures Park Classic', 'MYK9 Club Trial', 'E2Early Birds'])(
    'reads whole tokens only: %s is not flagged',
    text => {
      expect(ENGINEERING_VOCABULARY.test(text)).toBe(false);
    }
  );
});

describe('seed scope', () => {
  it('mirrors scope_shows in the seed guard migration', () => {
    const sql = readRepo('supabase/migrations/20260916213500_seed_demo_paid_stray_guard_fn.sql');
    const scope = sql.slice(sql.indexOf('scope_shows AS'), sql.indexOf('stray AS'));
    for (const id of SEED_SCOPE_SHOW_IDS) expect(scope).toContain(`'${id}'`);
    expect(scope).toContain(`id >= '${SEED_LOAD_SHOW_RANGE.from}'::uuid`);
    expect(scope).toContain(`id <  '${SEED_LOAD_SHOW_RANGE.to}'::uuid`);
    expect(scope.match(/dededede-[0-9a-f-]+/g)).toHaveLength(SEED_SCOPE_SHOW_IDS.length);
  });

  it.each([
    ['dededede-0000-0000-0000-000000000010', true],
    ['DEDEDEDE-0000-0000-0000-000000000012', true],
    ['dededede-0000-0000-0000-000000000013', false], // the seeded past show is outside scope
    ['a1090000-0000-0000-0010-300000000001', true], // load show 3
    ['a1090000-0000-0000-0011-000000000000', false], // the range is half-open
    ['f3360000-0000-0000-0000-000000000001', false], // the MYK9-615 offender
  ])('%s in scope -> %s', (id, want) => {
    expect(isSeedScopeShow(id)).toBe(want);
  });
});

describe('strayShows', () => {
  it('flags a test-named show outside the seed scope, by name or by location', () => {
    const offender = {
      id: 'f3360000-0000-0000-0000-000000000001',
      name: '[E2E MYK9-336] Past Due Payment Fixture',
      location: null,
    };
    const byLocation = {
      id: '11111111-0000-0000-0000-000000000001',
      name: 'Spring Classic',
      location: '200 Load Fixture Way, Tulsa, OK 74101',
    };
    const real = {
      id: '22222222-0000-0000-0000-000000000002',
      name: 'Tulsa Nosework Trial',
      location: 'Tulsa',
    };
    const seedLoad = {
      id: 'a1090000-0000-0000-0010-300000000001',
      name: 'MYK9-109 Load Show 3',
      location: null,
    };
    expect(strayShows([offender, byLocation, real, seedLoad])).toEqual([offender, byLocation]);
  });
});

describe('strayPublishedShowsCheck', () => {
  const AT = '2026-09-24T07:00:00.000Z';

  it('is ok on a clean reseed', () => {
    const rows = [
      {
        id: 'dededede-0000-0000-0000-000000000010',
        name: 'Heartland Scent Work Classic',
        location: '100 Dog Show Lane, Tulsa, OK 74101',
      },
      {
        id: 'dededede-0000-0000-0000-000000000013',
        name: 'Prairie Trail Spring Scent Work Trial',
        location: '200 Prairie Road, Wichita, KS 67202',
      },
    ];
    expect(strayPublishedShowsCheck({ rows }, AT)).toMatchObject({
      key: 'stray_published_shows',
      status: 'ok',
      counter_value: 0,
      checked_at: AT,
    });
  });

  it('warns and names each flagged show by id and name', () => {
    const check = strayPublishedShowsCheck(
      {
        rows: [
          {
            id: 'f3360000-0000-0000-0000-000000000001',
            name: '[E2E MYK9-336] Past Due Payment Fixture',
            location: null,
          },
        ],
      },
      AT
    );
    expect(check.status).toBe('warn');
    expect(check.counter_value).toBe(1);
    expect(check.detail).toBe(
      '1 listed show looks like test data: f3360000-0000-0000-0000-000000000001 "[E2E MYK9-336] Past Due Payment Fixture"'
    );
  });

  it.each([
    [
      'a read error',
      { error: 'permission denied for table shows' },
      /could not read the listed shows: permission denied/,
    ],
    ['no facts at all', undefined, /no listed-show rows/],
    ['a malformed row', { rows: [{ id: 1, name: 'x' }] }, /no listed-show rows/],
  ])('is an unprovable warn, never ok, on %s', (_label, facts, detail) => {
    const check = strayPublishedShowsCheck(facts, AT);
    expect(check.status).toBe('warn');
    expect(check.verification).toBe('unprovable');
    expect(check.detail).toMatch(detail);
  });

  it('runs on the nightly full snapshot and is carried forward by continuous runs', () => {
    const facts = { stray_published_shows: { rows: [] } };
    const full = buildSnapshot(facts, { now: Date.parse(AT), mode: 'full' });
    const nightly = full.checks.find(c => c.key === 'stray_published_shows');
    expect(nightly).toMatchObject({ status: 'ok', stale_after_ms: 48 * 60 * 60 * 1000 });

    const continuous = buildSnapshot(
      { stray_published_shows: undefined },
      { now: Date.parse(AT) + 5 * 60 * 1000, mode: 'continuous', previousChecks: full.checks }
    );
    expect(continuous.checks.find(c => c.key === 'stray_published_shows')).toMatchObject({
      status: 'ok',
      checked_at: nightly!.checked_at,
    });
  });
});

describe('the listing the check reads (Codex review, MYK9-741)', () => {
  // The status set is pinned against the app's listing in
  // src/features/admin-system-health/strayShowListing.test.ts (this file is
  // also typechecked as an edge test, which cannot load app services).

  const pages = (total: number) => async (from: number, to: number) => ({
    data: Array.from({ length: Math.max(0, Math.min(total, to + 1) - from) }, (_, i) => ({
      id: String(from + i),
    })),
    error: null,
  });

  it('reads past the first page, so a show on page two is still checked', async () => {
    const got = await readListedShows(pages(25), 10);
    expect('rows' in got && got.rows).toHaveLength(25);
  });

  it('reads an exactly-full last page, then stops on the empty one', async () => {
    const got = await readListedShows(pages(20), 10);
    expect('rows' in got && got.rows).toHaveLength(20);
  });

  it('never returns a partial listing: a failed page or too many pages is an error', async () => {
    let calls = 0;
    const failing = async () => {
      calls += 1;
      return calls === 2
        ? { data: null, error: { message: 'timeout' } }
        : { data: Array.from({ length: 10 }, () => ({})), error: null };
    };
    expect(await readListedShows(failing, 10)).toEqual({ error: 'timeout' });
    expect(await readListedShows(pages(100), 10, 3)).toEqual({
      error: 'more than 30 listed shows; not all were read',
    });
  });
});
