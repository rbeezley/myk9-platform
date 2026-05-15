/**
 * Search Query Helpers
 *
 * Shared row type interfaces for the search query modules. The search_history
 * and search_analytics tables are not yet included in the generated Supabase
 * Database type definition, so runtime row types live here. The `untypedFrom`
 * escape hatch they use lives in `_shared/untyped-from.ts` (cross-cutting).
 */

// ---------------------------------------------------------------------------
// Row types for tables missing from the generated Supabase schema
// ---------------------------------------------------------------------------

/** Row shape returned from the `search_history` table. */
export interface SearchHistoryRow {
  [key: string]: unknown;
  id: string;
  user_id: string;
  search_term: string;
  search_type: string;
  search_context?: string;
  results_count?: number;
  results_found?: boolean;
  search_filters?: Record<string, unknown>;
  search_sort?: Record<string, unknown>;
  search_duration_ms?: number;
  clicked_result_id?: string;
  clicked_result_position?: number;
  session_id?: string;
  created_at?: string;
}

/** Row shape returned from the `search_analytics` table. */
export interface SearchAnalyticsRow {
  [key: string]: unknown;
  id: string;
  search_term: string;
  search_type: string;
  frequency?: number;
  success_rate?: number;
  avg_results_count?: number;
  avg_click_position?: number;
  avg_search_duration_ms?: number;
  total_searches?: number;
  successful_searches?: number;
  first_searched_at?: string;
  last_searched_at?: string;
  last_aggregated_at?: string;
  created_at?: string;
  updated_at?: string;
}
