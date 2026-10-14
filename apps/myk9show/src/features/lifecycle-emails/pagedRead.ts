// PostgREST caps every read at max_rows (1000, supabase/config.toml) and reports no truncation,
// so a show-wide jobs read has to page explicitly (MYK9-1187).
export const LIFECYCLE_EMAIL_PAGE_SIZE = 1000;
// 50 pages is 50,000 jobs per show; past that, throw rather than loop on a runaway read.
export const LIFECYCLE_EMAIL_MAX_PAGES = 50;

interface PageResult<T> {
  data: T | null;
  error: { message?: string } | null;
}

interface PageQuery<T> extends PromiseLike<PageResult<T>> {
  order(column: string): PageQuery<T>;
  gt(column: string, value: unknown): PageQuery<T>;
  limit(count: number): PageQuery<T>;
}

/**
 * Reads every row of a query by keyset paging on `id`: each page is `id > lastId` in id order,
 * so a row that enters or leaves the filtered set mid-read can neither shift later pages (offset
 * paging skips or repeats rows) nor be returned twice. `buildQuery` must return a FRESH filtered
 * query per page. Returns the first error unthrown, so callers keep their own messages.
 */
export async function fetchAllPages<T extends { id: string }>(
  buildQuery: () => PageQuery<T[]>
): Promise<PageResult<T[]>> {
  const rows: T[] = [];
  let lastId: string | null = null;
  for (let page = 0; page < LIFECYCLE_EMAIL_MAX_PAGES; page += 1) {
    let query = buildQuery().order('id');
    if (lastId !== null) query = query.gt('id', lastId);
    const result = await query.limit(LIFECYCLE_EMAIL_PAGE_SIZE);
    if (result.error) return { data: null, error: result.error };
    const data = result.data ?? [];
    rows.push(...data);
    // Stop only on an EMPTY page: a hosted max_rows below our limit would otherwise read as "short".
    if (data.length === 0) return { data: rows, error: null };
    lastId = data[data.length - 1].id;
  }
  throw new Error(
    `Lifecycle email read exceeded ${LIFECYCLE_EMAIL_MAX_PAGES} pages of ${LIFECYCLE_EMAIL_PAGE_SIZE} rows`
  );
}
