/**
 * Every row changed since a watermark, in keyset pages on (updated_at, id)
 * (MYK9-1071).
 *
 * PostgREST caps a response at max_rows (1000), so a single request silently
 * truncates a large download, and the sync engine would then record a complete
 * full sync over a partial replica. Paging on (updated_at, id), not updated_at
 * alone, keeps progress when many rows share one timestamp (a bulk update).
 * Any page error, or running past the page cap, THROWS: the sync then fails and
 * nothing is recorded as complete.
 */
export const UPDATED_ROW_PAGE_SIZE = 1000;
export const UPDATED_ROW_MAX_PAGES = 200;

export interface UpdatedRowCursor {
  updatedAt: string;
  id: string;
}

export type UpdatedRowPageFetcher<T> = (
  cursor: UpdatedRowCursor | undefined,
  pageSize: number
) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** The PostgREST `or` filter for "strictly after this cursor". */
export function afterCursorFilter(cursor: UpdatedRowCursor): string {
  return `updated_at.gt."${cursor.updatedAt}",and(updated_at.eq."${cursor.updatedAt}",id.gt.${cursor.id})`;
}

export async function fetchUpdatedRowsInPages<T extends { id: string; updated_at: string | null }>(
  fetchPage: UpdatedRowPageFetcher<T>
): Promise<T[]> {
  const rows: T[] = [];
  let cursor: UpdatedRowCursor | undefined;
  for (let page = 0; page < UPDATED_ROW_MAX_PAGES; page++) {
    const { data, error } = await fetchPage(cursor, UPDATED_ROW_PAGE_SIZE);
    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    const pageRows = data ?? [];
    rows.push(...pageRows);
    if (pageRows.length < UPDATED_ROW_PAGE_SIZE) return rows;
    const last = pageRows[pageRows.length - 1]!;
    if (!last.updated_at) throw new Error('Cannot page past a row with no updated_at');
    cursor = { updatedAt: last.updated_at, id: String(last.id) };
  }
  throw new Error(`Download exceeded ${UPDATED_ROW_MAX_PAGES} pages; not marking it complete`);
}
