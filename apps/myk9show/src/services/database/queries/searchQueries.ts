/**
 * Search & Analytics Database Queries — Barrel Export
 *
 * Re-exports all search-related query modules for backward compatibility.
 * Each domain area is implemented in its own focused module:
 *
 * - search-history-queries.ts    — Search history CRUD operations
 * - search-analytics-queries.ts  — Search analytics CRUD and aggregation
 * - full-text-search-queries.ts  — Multi-table full-text search with relevance scoring
 * - search-suggestion-queries.ts — Search suggestions and autocomplete
 * - search-performance-queries.ts — Performance metrics and monitoring
 * - search-analytics-operations.ts — Combined high-level analytics summaries
 */

export { searchHistoryQueries } from './search-history-queries';
export { searchAnalyticsQueries } from './search-analytics-queries';
export { fullTextSearchQueries } from './full-text-search-queries';
export { searchSuggestionQueries } from './search-suggestion-queries';
export { searchPerformanceQueries } from './search-performance-queries';
export { searchAnalyticsOperations } from './search-analytics-operations';
