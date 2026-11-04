import { supabase } from '@/services/database/supabaseClient';
import { logger } from '@/services/LoggingService';

/**
 * PostgREST caps every response at `max_rows` (supabase/config.toml, 1000), so
 * `get_admin_user_list` alone returns only the first 1000 people in name order
 * (MYK9-1561). Everything that reads the roster (the table, the `?userId=` deep
 * link, the dashboard Signups drill-down) needs all of it, so page through the
 * one RPC here. The RPC orders by (last_name, first_name, id), which is unique,
 * so consecutive pages neither skip nor repeat a person.
 */
export const ADMIN_USER_LIST_PAGE_SIZE = 1000;
/** Loop guard: 50 pages is 50,000 people, far beyond any real roster. */
export const ADMIN_USER_LIST_MAX_PAGES = 50;

export async function fetchAdminUserListRows(
  showDeleted: boolean
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];

  for (let page = 0; page < ADMIN_USER_LIST_MAX_PAGES; page++) {
    const from = page * ADMIN_USER_LIST_PAGE_SIZE;
    const { data, error } = await supabase
      .rpc('get_admin_user_list', { show_deleted: showDeleted })
      .range(from, from + ADMIN_USER_LIST_PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    const pageRows = (data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...pageRows);
    // A short (or empty) page is the last one.
    if (pageRows.length < ADMIN_USER_LIST_PAGE_SIZE) return rows;
  }

  // Never silently return a truncated roster as if it were whole.
  const error = new Error(
    `Admin user list exceeded ${ADMIN_USER_LIST_MAX_PAGES} pages; refusing to return a partial roster`
  );
  logger.error('Admin user list paging hit the page cap', 'query', {}, error);
  throw error;
}
