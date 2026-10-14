// PostgREST caps every read at max_rows (1000, supabase/config.toml) and reports no truncation,
// so a show-wide jobs read has to page explicitly (MYK9-1187).
export const LIFECYCLE_EMAIL_PAGE_SIZE = 1000;
// 50 pages is 50,000 jobs per show; past that, throw rather than loop on a runaway read.
export const LIFECYCLE_EMAIL_MAX_PAGES = 50;

interface PageResult<T> {
  data: T[] | null;
  error: { message?: string } | null;
}

/**
 * Reads every page of a query until a short page comes back. `buildPage` must return a FRESH
 * query ordered on a unique column (`id`) so page boundaries cannot overlap or skip rows under
 * concurrent writes. Returns the first error unthrown, so callers keep their own messages.
 */
export async function fetchAllPages<T>(
  buildPage: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<PageResult<T>> {
  const rows: T[] = [];
  for (let page = 0; page < LIFECYCLE_EMAIL_MAX_PAGES; page += 1) {
    const from = page * LIFECYCLE_EMAIL_PAGE_SIZE;
    const result = await buildPage(from, from + LIFECYCLE_EMAIL_PAGE_SIZE - 1);
    if (result.error) return { data: null, error: result.error };
    const data = result.data ?? [];
    rows.push(...data);
    if (data.length < LIFECYCLE_EMAIL_PAGE_SIZE) return { data: rows, error: null };
  }
  throw new Error(
    `Lifecycle email read exceeded ${LIFECYCLE_EMAIL_MAX_PAGES} pages of ${LIFECYCLE_EMAIL_PAGE_SIZE} rows`
  );
}
