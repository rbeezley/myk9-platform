/**
 * MYK9-741: published shows that look like test data.
 *
 * `[E2E MYK9-336] Past Due Payment Fixture` was hand-seeded on staging for a
 * browser replay and stayed published on the public listing (MYK9-615). No
 * committed code ever held that name, so no repo guard could catch it; this
 * check reads the live `public.shows` rows on the nightly full run instead.
 *
 * A show is flagged when it is published, not soft-deleted, OUTSIDE the seed
 * scope, and its name or location carries engineering vocabulary. Being
 * outside the seed scope alone is not enough: real club shows are outside it
 * too, and so is the seeded past show `...013`.
 *
 * Deno-free and side-effect free, like its `systemHealthChecks.ts` siblings;
 * cron-health-check does the query.
 */

import type { SnapshotCheck } from './systemHealthChecks.ts';

export const STRAY_PUBLISHED_SHOWS_KEY = 'stray_published_shows';

/**
 * Engineering vocabulary in a show name or location. Each alternative is a
 * whole token, so "Loaded", "E2Early" or "fixtures of the week" read as words.
 * Known answers are pinned in strayShowChecks.test.ts, both ways.
 */
export const ENGINEERING_VOCABULARY = /\bE2E\b|\bMYK9-\d+\b|\bLoad \d+\b|\bFixture\b|\bZZ Audit\b/i;

/**
 * The seed-owned shows, mirroring `scope_shows` in
 * `public.seed_demo_assert_no_paid_strays()` (migration 20260916213500): the
 * three demo shows and the MYK9-109 load-fixture id range. A test reads that
 * migration and fails if the two drift apart.
 */
export const SEED_SCOPE_SHOW_IDS: readonly string[] = [
  'dededede-0000-0000-0000-000000000010',
  'dededede-0000-0000-0000-000000000011',
  'dededede-0000-0000-0000-000000000012',
];
export const SEED_LOAD_SHOW_RANGE = {
  from: 'a1090000-0000-0000-0010-000000000000',
  to: 'a1090000-0000-0000-0011-000000000000',
} as const;

/** Postgres orders uuids by their bytes, which for the canonical lowercase text form is string order. */
export function isSeedScopeShow(id: string): boolean {
  const lower = id.toLowerCase();
  return (
    SEED_SCOPE_SHOW_IDS.includes(lower) ||
    (lower >= SEED_LOAD_SHOW_RANGE.from && lower < SEED_LOAD_SHOW_RANGE.to)
  );
}

export interface ShowRow {
  id: string;
  name: string;
  location: string | null;
}

function parseRows(raw: unknown): ShowRow[] | null {
  if (!Array.isArray(raw)) return null;
  const rows: ShowRow[] = [];
  for (const value of raw) {
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    if (typeof row.id !== 'string' || typeof row.name !== 'string') return null;
    rows.push({
      id: row.id,
      name: row.name,
      location: typeof row.location === 'string' ? row.location : null,
    });
  }
  return rows;
}

/** The published, non-deleted rows the runner read that this check flags. */
export function strayShows(rows: readonly ShowRow[]): ShowRow[] {
  return rows.filter(
    row =>
      !isSeedScopeShow(row.id) &&
      (ENGINEERING_VOCABULARY.test(row.name) || ENGINEERING_VOCABULARY.test(row.location ?? ''))
  );
}

/**
 * Judge `{ rows }` (published, non-deleted shows: id, name, location) or
 * `{ error }`. Malformed input is a `warn` the board shows as unprovable, never
 * a silent `ok`: a check that could not read the table has proved nothing.
 */
export function strayPublishedShowsCheck(rawFacts: unknown, checkedAt: string): SnapshotCheck {
  const base = {
    key: STRAY_PUBLISHED_SHOWS_KEY,
    label: 'Test shows on the public listing',
    checked_at: checkedAt,
  } as const;

  const facts =
    rawFacts && typeof rawFacts === 'object' ? (rawFacts as Record<string, unknown>) : {};
  if (typeof facts.error === 'string') {
    return {
      ...base,
      status: 'warn',
      detail: `could not read published shows: ${facts.error}`,
      verification: 'unprovable',
    };
  }
  const rows = parseRows(facts.rows);
  if (rows === null) {
    return {
      ...base,
      status: 'warn',
      detail: 'the runner returned no published-show rows to check',
      verification: 'unprovable',
    };
  }

  const flagged = strayShows(rows);
  if (flagged.length === 0) {
    return {
      ...base,
      status: 'ok',
      detail: `no test-named shows among ${rows.length} published`,
      counter_value: 0,
    };
  }
  return {
    ...base,
    status: 'warn',
    detail: `${flagged.length} published show${flagged.length === 1 ? ' looks' : 's look'} like test data: ${flagged
      .map(row => `${row.id} "${row.name}"`)
      .join('; ')}`,
    counter_value: flagged.length,
  };
}
