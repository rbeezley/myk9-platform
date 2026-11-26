import { abortReason } from '@myk9/replication';
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
  /** Present on the Supabase builders; releases the request when a sync is cancelled. */
  abortSignal?(signal: AbortSignal): Q;
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
  /** A cancelled sync stops paging and releases the in-flight request. */
  signal?: AbortSignal | undefined;
  /** Prefix for the thrown error message. */
  errorPrefix?: string;
}

/**
 * Reads every row newer than `since` (callers cast to their row type), oldest
 * first. Only an EMPTY page ends the read (MYK9-2252): the hosted `max_rows` may be
 * lower than `pageSize`, so a short page does not mean the server ran out. A page
 * whose last row has no cursor values throws: returning it would be a silent short read.
 */
export async function fetchKeysetPages<Q extends KeysetQuery<Q>>({
  base,
  since,
  scope,
  pageSize = POSTGREST_MAX_ROWS,
  signal,
  errorPrefix = 'Supabase query failed',
}: FetchKeysetPagesOptions<Q>): Promise<KeysetRow[]> {
  const rows: KeysetRow[] = [];
  let cursorUpdatedAt: string | null = null;
  let cursorId: string | null = null;

  for (;;) {
    if (signal?.aborted) throw abortReason(signal);
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
    if (signal && typeof query.abortSignal === 'function') query = query.abortSignal(signal);

    const response =
      typeof query.range === 'function'
        ? await query.range(0, pageSize - 1)
        : await (query as unknown as PromiseLike<PageResult>);
    if (response.error) throw new Error(`${errorPrefix}: ${response.error.message}`);

    const pageRows = (response.data ?? []) as KeysetRow[];
    // Only an empty page ends the read: a page shorter than `pageSize` can be the
    // server's `max_rows` being lower than `pageSize`, with more rows still behind it.
    if (pageRows.length === 0) return rows;

    const lastRow = pageRows[pageRows.length - 1];
    if (!lastRow?.updated_at || !lastRow.id) {
      throw new Error(`${errorPrefix}: a page ended on a row without id or updated_at`);
    }
    // A correct server returns rows strictly after the cursor. A page that ends on the
    // row the cursor already sits on is the server ignoring it: stop, never loop.
    if (String(lastRow.updated_at) === cursorUpdatedAt && String(lastRow.id) === cursorId) {
      return rows;
    }
    rows.push(...pageRows);
    cursorUpdatedAt = String(lastRow.updated_at);
    cursorId = String(lastRow.id);
  }
}
