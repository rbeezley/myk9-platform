/**
 * Search & Analytics System Types
 * 
 * Comprehensive types for managing search functionality, search history tracking,
 * and search analytics across the myK9Show application with performance optimization.
 */

// Core Search History Types
export interface SearchHistory {
  id: string;
  user_id: string;
  search_term: string;
  search_type: string;
  search_context?: string;
  results_count?: number;
  results_found?: boolean;
  search_filters?: Record<string, unknown> | null;
  search_sort?: Record<string, unknown> | null;
  search_duration_ms?: number;
  clicked_result_id?: string;
  clicked_result_position?: number;
  session_id?: string;
  created_at: string;
}

export interface CreateSearchHistoryData {
  user_id: string;
  search_term: string;
  search_type: string;
  search_context?: string;
  results_count?: number;
  results_found?: boolean;
  search_filters?: Record<string, unknown> | null;
  search_sort?: Record<string, unknown> | null;
  search_duration_ms?: number;
  clicked_result_id?: string;
  clicked_result_position?: number;
  session_id?: string;
}

export interface UpdateSearchHistoryData {
  id: string;
  clicked_result_id?: string;
  clicked_result_position?: number;
  search_duration_ms?: number;
}

// Search Analytics Types
export interface SearchAnalytics {
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
  created_at: string;
  updated_at: string;
}

export interface CreateSearchAnalyticsData {
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
}

export interface UpdateSearchAnalyticsData {
  id: string;
  frequency?: number;
  success_rate?: number;
  avg_results_count?: number;
  avg_click_position?: number;
  avg_search_duration_ms?: number;
  total_searches?: number;
  successful_searches?: number;
  last_searched_at?: string;
  last_aggregated_at?: string;
}

// Search Request Types
export interface SearchRequest {
  query: string;
  type: SearchType;
  context?: SearchContext;
  filters?: SearchFilters;
  sort?: SearchSort;
  pagination?: SearchPagination;
  session_id?: string;
}

export interface SearchFilters {
  organization?: string;
  discipline?: string;
  level?: string;
  breed?: string;
  location?: string;
  date_from?: string;
  date_to?: string;
  is_active?: boolean;
  user_id?: string;
  [key: string]: unknown;
}

export interface SearchSort extends Record<string, unknown> {
  field: string;
  direction: 'asc' | 'desc';
  secondary_field?: string;
  secondary_direction?: 'asc' | 'desc';
}

export interface SearchPagination {
  page: number;
  per_page: number;
  offset?: number;
}

// Search Result Types
export interface SearchResult<T = unknown> {
  id: string;
  type: SearchType;
  title: string;
  description?: string;
  data: T;
  relevance_score?: number;
  highlighted_fields?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface SearchResponse<T = unknown> {
  results: SearchResult<T>[];
  total_count: number;
  search_time_ms: number;
  query: string;
  search_type: SearchType;
  filters_applied: SearchFilters;
  sort_applied?: SearchSort;
  pagination: {
    page: number;
    per_page: number;
    total_pages: number;
    has_next: boolean;
    has_previous: boolean;
  };
  suggestions?: string[];
  corrected_query?: string;
}

// Full-Text Search Types
export interface FullTextSearchRequest {
  query: string;
  tables: SearchableTable[];
  weights?: Record<string, number>;
  filters?: Record<string, SearchFilters>;
  max_results?: number;
  min_relevance?: number;
}

export interface FullTextSearchResult {
  table: SearchableTable;
  id: string;
  title: string;
  content: string;
  relevance_score: number;
  highlighted_content: string;
  data: Record<string, unknown>;
}

// Search Suggestion Types
export interface SearchSuggestion {
  suggestion: string;
  type: SearchType;
  frequency: number;
  success_rate: number;
  context?: string;
}

export interface PopularSearch {
  search_term: string;
  search_type: SearchType;
  frequency: number;
  success_rate: number;
  trend: 'up' | 'down' | 'stable';
  period: SearchPeriod;
}

// Search Performance Types
export interface SearchPerformanceMetrics {
  avg_search_duration_ms: number;
  total_searches: number;
  successful_searches: number;
  success_rate: number;
  popular_terms: PopularSearch[];
  slow_queries: {
    query: string;
    avg_duration_ms: number;
    frequency: number;
  }[];
  failed_searches: {
    query: string;
    failure_rate: number;
    last_failed_at: string;
  }[];
  search_trends: {
    date: string;
    searches: number;
    success_rate: number;
    avg_duration: number;
  }[];
}

// Analytics Dashboard Types
export interface SearchAnalyticsSummary {
  total_searches: number;
  unique_search_terms: number;
  avg_success_rate: number;
  avg_search_duration_ms: number;
  most_popular_types: SearchType[];
  trending_searches: PopularSearch[];
  performance_metrics: SearchPerformanceMetrics;
  user_search_patterns: {
    power_users: number;
    casual_users: number;
    avg_searches_per_user: number;
    search_frequency_distribution: Record<string, number>;
  };
}

// Filter Types
export interface SearchHistoryFilters {
  user_id?: string;
  search_type?: SearchType;
  search_context?: string;
  results_found?: boolean;
  session_id?: string;
  date_from?: string;
  date_to?: string;
  search_term?: string;
}

export interface SearchAnalyticsFilters {
  search_type?: SearchType;
  min_frequency?: number;
  min_success_rate?: number;
  date_from?: string;
  date_to?: string;
  search_term?: string;
}

// Search Optimization Types
export interface SearchOptimization {
  query_expansion: string[];
  spell_correction?: string;
  synonym_suggestions: string[];
  filter_suggestions: SearchFilters;
  recommended_sort: SearchSort;
  performance_hints: string[];
}

export interface SearchIndex {
  table: SearchableTable;
  fields: string[];
  weights: Record<string, number>;
  last_updated: string;
  document_count: number;
  avg_document_size: number;
}

// Import/Export Types
export interface ImportSearchData {
  search_history: CreateSearchHistoryData[];
  search_analytics: CreateSearchAnalyticsData[];
  import_source: string;
  import_date: string;
}

export interface ExportSearchData {
  search_history: SearchHistory[];
  search_analytics: SearchAnalytics[];
  export_date: string;
  exported_by: string;
  filters_applied?: Record<string, unknown>;
  date_range: {
    from: string;
    to: string;
  };
}

// Constants and Enums
export const SEARCH_TYPES = [
  'dogs',
  'users',
  'shows',
  'clubs',
  'classes',
  'achievements',
  'competitions',
  'judges',
  'registrations',
  'health_records',
  'global',
  'advanced'
] as const;

export const SEARCH_CONTEXTS = [
  'dashboard',
  'list_view',
  'form_autocomplete',
  'navigation',
  'quick_search',
  'advanced_search',
  'filter_search',
  'related_items'
] as const;

export const SEARCHABLE_TABLES = [
  'dog',
  'user',
  'show',
  'club',
  'class',
  'achievement',
  'competition',
  'judge_qualification',
  'registration',
  'health_record'
] as const;

export const SEARCH_PERIODS = [
  'last_hour',
  'last_day',
  'last_week',
  'last_month',
  'last_quarter',
  'last_year',
  'all_time'
] as const;

export const SEARCH_SORT_FIELDS = [
  'relevance',
  'date',
  'alphabetical',
  'popularity',
  'recent',
  'frequency',
  'success_rate'
] as const;

export type SearchType = typeof SEARCH_TYPES[number];
export type SearchContext = typeof SEARCH_CONTEXTS[number];
export type SearchableTable = typeof SEARCHABLE_TABLES[number];
export type SearchPeriod = typeof SEARCH_PERIODS[number];
export type SearchSortField = typeof SEARCH_SORT_FIELDS[number];

// Advanced Search Types
export interface AdvancedSearchQuery {
  must_have: string[];
  should_have: string[];
  must_not_have: string[];
  exact_phrase?: string;
  proximity_search?: {
    terms: string[];
    distance: number;
  };
  wildcard_search?: string;
  fuzzy_search?: {
    term: string;
    fuzziness: number;
  };
}

export interface SearchRanking {
  field_weights: Record<string, number>;
  boost_recent: boolean;
  boost_popular: boolean;
  boost_user_context: boolean;
  custom_boost_functions?: Array<{
    field: string;
    function: 'linear' | 'logarithmic' | 'exponential';
    factor: number;
  }>;
}

// Real-time Search Types
export interface RealTimeSearchConfig {
  enable_autocomplete: boolean;
  enable_suggestions: boolean;
  enable_spell_check: boolean;
  min_query_length: number;
  debounce_ms: number;
  max_suggestions: number;
  cache_duration_ms: number;
}

export interface SearchCache {
  key: string;
  query: string;
  results: SearchResponse;
  created_at: string;
  expires_at: string;
  hit_count: number;
  last_accessed: string;
}

// Machine Learning Types
export interface SearchMLFeatures {
  query_length: number;
  query_complexity: number;
  user_search_history_count: number;
  time_of_day: number;
  day_of_week: number;
  search_context_numeric: number;
  historical_success_rate: number;
  query_popularity: number;
}

export interface SearchMLPrediction {
  predicted_success_rate: number;
  suggested_refinements: string[];
  predicted_click_position: number;
  confidence_score: number;
  model_version: string;
}

// Error Types
export interface SearchError {
  code: string;
  message: string;
  query: string;
  search_type: SearchType;
  user_id?: string;
  timestamp: string;
  stack_trace?: string;
  recovery_suggestions: string[];
}

// Configuration Types
export interface SearchConfig {
  full_text_search: {
    enabled: boolean;
    min_query_length: number;
    max_results: number;
    highlight_enabled: boolean;
    fuzzy_matching: boolean;
    stemming_enabled: boolean;
  };
  analytics: {
    enabled: boolean;
    track_user_searches: boolean;
    track_performance: boolean;
    aggregation_interval_hours: number;
    retention_days: number;
  };
  caching: {
    enabled: boolean;
    cache_duration_minutes: number;
    max_cache_size: number;
    cache_popular_searches: boolean;
  };
  autocomplete: {
    enabled: boolean;
    min_query_length: number;
    max_suggestions: number;
    debounce_ms: number;
    include_history: boolean;
  };
  performance: {
    max_search_duration_ms: number;
    index_optimization: boolean;
    query_optimization: boolean;
    result_pagination: boolean;
  };
}