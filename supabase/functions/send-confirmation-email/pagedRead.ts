/** PostgREST truncates one response at its max_rows (1,000 here), so a complete read pages. */
export const READ_PAGE_SIZE = 1000;

export interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Reads every row by paging until a page comes back short. The caller's query must carry a
 * stable order (id) so pages never overlap or skip. Any page error throws: a partial read is
 * never returned as if it were complete.
 */
export async function readAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  errorPrefix: string
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += READ_PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + READ_PAGE_SIZE - 1);
    if (error) throw new Error(`${errorPrefix}: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < READ_PAGE_SIZE) return rows;
  }
}
