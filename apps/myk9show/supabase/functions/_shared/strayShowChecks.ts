/**
 * MYK9-741: shows on the public listing that look like test data.
 *
 * `[E2E MYK9-336] Past Due Payment Fixture` was hand-seeded on staging for a
 * browser replay and stayed published on the public listing (MYK9-615). No
 * committed code ever held that name, so no repo guard could catch it; this
 * check reads the live `public.shows` rows on the nightly full run instead.
 *
 * A show is flagged when the public listing shows it (any of
 * `PUBLIC_LISTING_STATUSES`, not soft-deleted), it is OUTSIDE the seed
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
 * Every status the public /shows listing includes. A show that moves on from
 * `published` to `upcoming`, `in_progress` or `completed` is still listed, so
 * the check reads all four. Pinned against the app's `PUBLIC_SHOW_STATUSES`
 * (`src/services/database/shows/reads.postgrest.ts`) by the test.
 */
export const PUBLIC_LISTING_STATUSES = [
  'published',
  'upcoming',
  'in_progress',
  'completed',
] as const;

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

/** PostgREST caps a response at `max_rows` (1000 here), so the listing is read in pages. */
export const SHOW_PAGE_SIZE = 1000;
/** A listing larger than this is reported as unprovable rather than half-read. */
export const SHOW_PAGE_LIMIT = 50;

/** One page of rows `from`..`to` inclusive, as a PostgREST `.range()` returns it. */
export type ShowPageFetcher = (
  from: number,
  to: number
) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/**
 * Reads every page until a short one, as `{ rows }`, or `{ error }` when a page
 * fails or the listing outgrows `SHOW_PAGE_LIMIT` pages. Never a partial
 * `{ rows }`: the check would report `ok` about shows it never saw.
 */
export async function readListedShows(
  fetchPage: ShowPageFetcher,
  pageSize = SHOW_PAGE_SIZE,
  pageLimit = SHOW_PAGE_LIMIT
): Promise<{ rows: unknown[] } | { error: string }> {
  const rows: unknown[] = [];
  for (let page = 0; page < pageLimit; page++) {
    const from = page * pageSize;
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) return { error: error.message };
    const got = data ?? [];
    rows.push(...got);
    if (got.length < pageSize) return { rows };
  }
  return { error: `more than ${pageLimit * pageSize} listed shows; not all were read` };
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

/** The listed, non-deleted rows the runner read that this check flags. */
export function strayShows(rows: readonly ShowRow[]): ShowRow[] {
  return rows.filter(
    row =>
      !isSeedScopeShow(row.id) &&
      (ENGINEERING_VOCABULARY.test(row.name) || ENGINEERING_VOCABULARY.test(row.location ?? ''))
  );
}

/**
 * Judge `{ rows }` (every listed, non-deleted show: id, name, location) or
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
      detail: `could not read the listed shows: ${facts.error}`,
      verification: 'unprovable',
    };
  }
  const rows = parseRows(facts.rows);
  if (rows === null) {
    return {
      ...base,
      status: 'warn',
      detail: 'the runner returned no listed-show rows to check',
      verification: 'unprovable',
    };
  }

  const flagged = strayShows(rows);
  if (flagged.length === 0) {
    return {
      ...base,
      status: 'ok',
      detail: `no test-named shows among ${rows.length} listed`,
      counter_value: 0,
    };
  }
  return {
    ...base,
    status: 'warn',
    detail: `${flagged.length} listed show${flagged.length === 1 ? ' looks' : 's look'} like test data: ${flagged
      .map(row => `${row.id} "${row.name}"`)
      .join('; ')}`,
    counter_value: flagged.length,
  };
}
