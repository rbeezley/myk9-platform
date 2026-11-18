import { HttpError } from '../_shared/http/responses.ts';

/** PostgREST caps a response at 1,000 rows (`supabase/config.toml`); stay under it. */
export const PAGE_SIZE = 1000;
/** Ids per `.in(...)`: keeps the request URL short however many shows a busy week holds. */
export const IN_CHUNK = 100;

export function chunk<T>(items: readonly T[], size: number = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Every row of a query, page by page. `page` must apply a STABLE total order (a unique column
 * last), or rows can repeat or vanish between pages. A failed page throws: a partial scan would
 * read as "no such row".
 */
export async function fetchAllPages<Row>(
  failureMessage: string,
  page: (
    from: number,
    to: number
  ) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new HttpError(500, failureMessage);
    const got = data ?? [];
    rows.push(...got);
    if (got.length < PAGE_SIZE) return rows;
  }
}
