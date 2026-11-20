import { POSTGREST_MAX_ROWS } from './postgrestMaxRows';

/**
 * MYK9-2252: one keyset pager for replicated tables whose adapter used to fetch
 * everything in a single request. PostgREST returns at most `max_rows` rows, so
 * an unpaged fetch returned the OLDEST 1,000 rows by `updated_at`, the watermark
 * never moved and the newest rows never arrived while every sync reported success.
 *
 * Paging is keyset on (`updated_at`, `id`), never offset: rows written during the
 * sync cannot be skipped or repeated, and `id` breaks the tie between rows that
 * share one `updated_at` (classes cloned in one statement do), which a cursor on
 * the timestamp alone would skip at a page boundary. Modelled on the entries
 * pager in ReplicatedEntriesTable.
 */

export interface KeysetRow {
  id?: unknown;
  updated_at?: unknown;
}

interface PageResult {
  data: unknown[] | null;
  error: { message: string } | null;
}

/** The PostgREST builder methods the pager calls; the Supabase builders satisfy it. */
export interface KeysetQuery<Q> {
  gt(column: string, value: string): Q;
  or(filters: string): Q;
  order(column: string, options: { ascending: boolean }): Q;
  range(from: number, to: number): PromiseLike<PageResult>;
}

export interface FetchKeysetPagesOptions<Q extends KeysetQuery<Q>> {
  /** Starts a fresh query: select plus the filters that do not depend on the page. */
  base: () => Q;
  /** Rows strictly newer than this (ms epoch) on the first page. */
  since: number;
  /** Applied after ordering on every page (scope filters). */
  scope?: (query: Q) => Q;
  /** Rows per request; defaults to PostgREST's `max_rows`. */
  pageSize?: number;
  /** Prefix for the thrown error message. */
  errorPrefix?: string;
}

/**
 * Reads every row newer (callers cast to their row type) than `since`, oldest first. A page shorter than
 * `pageSize` ends the read; `pageSize` is the server's `max_rows`, so a short page
 * is the server running out of rows.
 */
export async function fetchKeysetPages<Q extends KeysetQuery<Q>>({
  base,
  since,
  scope,
  pageSize = POSTGREST_MAX_ROWS,
  errorPrefix = 'Supabase query failed',
}: FetchKeysetPagesOptions<Q>): Promise<KeysetRow[]> {
  const rows: KeysetRow[] = [];
  let cursorUpdatedAt: string | null = null;
  let cursorId: string | null = null;

  for (;;) {
    let query = base();
    if (cursorUpdatedAt && cursorId && typeof query.or === 'function') {
      query = query.or(
        `updated_at.gt.${cursorUpdatedAt},and(updated_at.eq.${cursorUpdatedAt},id.gt.${cursorId})`
      );
    } else {
      query = query.gt('updated_at', new Date(since).toISOString());
    }
    query = query.order('updated_at', { ascending: true });
    // The guards keep thin test doubles (a chain that ends at the first `order`)
    // working, exactly as the entries pager does; the real builders have both.
    if (typeof query.order === 'function') query = query.order('id', { ascending: true });
    if (scope) query = scope(query);

    const response =
      typeof query.range === 'function'
        ? await query.range(0, pageSize - 1)
        : await (query as unknown as PromiseLike<PageResult>);
    if (response.error) throw new Error(`${errorPrefix}: ${response.error.message}`);

    const pageRows = (response.data ?? []) as KeysetRow[];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) return rows;

    const lastRow = pageRows[pageRows.length - 1];
    if (!lastRow?.updated_at || !lastRow.id) return rows;
    cursorUpdatedAt = String(lastRow.updated_at);
    cursorId = String(lastRow.id);
  }
}
