/**
 * PostgREST's `max_rows` (supabase/config.toml, `[api]`): the most rows any one
 * response carries, however many the query matches. An adapter whose fetch is not
 * paginated therefore returns at most this many rows per pass (the engine's
 * `remotePageSize`, MYK9-1301). Adapters that page to completion (the keyset
 * pager, MYK9-2252) set no `remotePageSize`: a full page is never a truncation.
 */
export const POSTGREST_MAX_ROWS = 1000;
