/**
 * Full-Text Search Database Queries
 *
 * Multi-table full-text search with configurable relevance scoring,
 * per-table search field configuration, content extraction, and
 * query highlighting.
 */

import { logger } from '@/services/LoggingService';
import type {
  FullTextSearchRequest,
  FullTextSearchResult,
  SearchableTable,
} from '../../../types/search-analytics';
import { untypedFrom } from './search-query-helpers';

export const fullTextSearchQueries = {
  // Perform full-text search across multiple tables
  async search(request: FullTextSearchRequest): Promise<FullTextSearchResult[]> {
    const results: FullTextSearchResult[] = [];

    for (const table of request.tables) {
      try {
        const tableResults = await this.searchTable(table, request);
        results.push(...tableResults);
      } catch (error) {
        logger.error(`Search failed for table ${table}:`, 'database', {}, error as Error);
        // Continue with other tables
      }
    }

    // Sort by relevance score
    results.sort((a, b) => b.relevance_score - a.relevance_score);

    // Apply max results limit
    if (request.max_results) {
      return results.slice(0, request.max_results);
    }

    return results;
  },

  // Search specific table
  async searchTable(
    table: SearchableTable,
    request: FullTextSearchRequest
  ): Promise<FullTextSearchResult[]> {
    const searchConfig = this.getTableSearchConfig(table);
    const actualTableName = this.getActualTableName(table);

    const baseQuery = untypedFrom(actualTableName).select('*');

    // PostgrestFilterBuilder chain — exact shape depends on runtime filters
    let query: ReturnType<typeof untypedFrom> = baseQuery;

    // Apply table-specific search logic
    if (searchConfig.searchFields.length > 0) {
      const searchConditions = searchConfig.searchFields
        .map(field => `${field}.ilike.%${request.query}%`)
        .join(',');

      query = query.or(searchConditions);
    }

    // Apply filters if provided for this table
    if (request.filters && request.filters[table]) {
      const filters = request.filters[table];
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      });
    }

    const { data: results, error } = await query.limit(100);

    if (error) {
      throw new Error(`Failed to search ${table}: ${error.message}`);
    }

    // Transform results to FullTextSearchResult format
    return (results || [])
      .map((item: Record<string, unknown>) => {
        // Handle potential query errors
        if (!item || typeof item !== 'object' || (item && 'error' in item)) {
          return null;
        }

        const itemData = item as Record<string, unknown>;
        const relevanceScore = this.calculateRelevanceScore(
          itemData,
          request.query,
          searchConfig.searchFields,
          request.weights?.[table] || 1.0
        );

        // Skip results below minimum relevance
        if (request.min_relevance && relevanceScore < request.min_relevance) {
          return null;
        }

        return {
          table,
          id: String(itemData.id),
          title: this.extractTitle(itemData, searchConfig.titleField),
          content: this.extractContent(itemData, searchConfig.searchFields),
          relevance_score: relevanceScore,
          highlighted_content: this.highlightQuery(
            this.extractContent(itemData, searchConfig.searchFields),
            request.query
          ),
          data: itemData,
        };
      })
      .filter(Boolean) as FullTextSearchResult[];
  },

  // Get search configuration for table
  getTableSearchConfig(table: SearchableTable) {
    const configs: Record<SearchableTable, { searchFields: string[]; titleField: string }> = {
      dog: { searchFields: ['name', 'breed', 'registration_number'], titleField: 'name' },
      user: {
        searchFields: ['first_name', 'last_name', 'email', 'phone'],
        titleField: 'first_name',
      },
      show: { searchFields: ['name', 'location', 'description'], titleField: 'name' },
      club: { searchFields: ['name', 'location', 'description'], titleField: 'name' },
      class: { searchFields: ['name', 'description', 'level'], titleField: 'name' },
      achievement: { searchFields: ['title', 'organization', 'notes'], titleField: 'title' },
      competition: {
        searchFields: ['competition_name', 'location', 'notes'],
        titleField: 'competition_name',
      },
      judge_qualification: {
        searchFields: ['organization', 'qualification_level', 'notes'],
        titleField: 'organization',
      },
      registration: {
        searchFields: ['registration_number', 'organization', 'notes'],
        titleField: 'registration_number',
      },
      health_record: {
        searchFields: ['record_type', 'description', 'notes'],
        titleField: 'record_type',
      },
    };

    return configs[table] || { searchFields: ['name'], titleField: 'name' };
  },

  // Map logical table names to actual database table names
  getActualTableName(table: SearchableTable): string {
    const tableMap: Record<SearchableTable, string> = {
      dog: 'dog',
      user: 'user',
      show: 'show',
      club: 'club',
      class: 'class',
      achievement: 'achievement',
      competition: 'competition',
      judge_qualification: 'judge_qualification',
      registration: 'dog_registration', // Maps to actual table name
      health_record: 'health_record',
    };

    return tableMap[table] || table;
  },

  // Calculate relevance score
  calculateRelevanceScore(
    item: Record<string, unknown>,
    query: string,
    fields: string[],
    weight: number
  ): number {
    const queryLower = query.toLowerCase();
    let score = 0;

    fields.forEach(field => {
      const value = String(item[field] || '').toLowerCase();

      // Exact match gets highest score
      if (value === queryLower) {
        score += 10;
      }
      // Starts with query gets high score
      else if (value.startsWith(queryLower)) {
        score += 7;
      }
      // Contains query gets medium score
      else if (value.includes(queryLower)) {
        score += 5;
      }
      // Word boundary match gets lower score
      else if (new RegExp(`\\b${queryLower}`, 'i').test(value)) {
        score += 3;
      }
    });

    return score * weight;
  },

  // Extract title from item
  extractTitle(item: Record<string, unknown>, titleField: string): string {
    return String(item[titleField] || item.name || item.id || 'Unknown');
  },

  // Extract content from item
  extractContent(item: Record<string, unknown>, fields: string[]): string {
    return fields
      .map(field => String(item[field] || ''))
      .filter(Boolean)
      .join(' ')
      .substring(0, 200);
  },

  // Highlight query in content
  highlightQuery(content: string, query: string): string {
    if (!query || !content) return content;

    const regex = new RegExp(`(${query})`, 'gi');
    return content.replace(regex, '<mark>$1</mark>');
  },
};
