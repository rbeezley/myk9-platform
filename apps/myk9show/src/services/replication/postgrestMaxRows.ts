/**
 * PostgREST's `max_rows` (supabase/config.toml, `[api]`): the most rows any one
 * response carries, however many the query matches. An adapter whose fetch is not
 * paginated therefore returns at most this many rows per pass, and a delta that
 * reaches it may be truncated (the engine's `remotePageSize`, MYK9-1301).
 */
export const POSTGREST_MAX_ROWS = 1000;
