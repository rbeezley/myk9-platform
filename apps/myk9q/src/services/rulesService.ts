import { supabase } from '../lib/supabase';
import { logger } from '@/utils/logger';

/**
 * Rules Assistant Service
 *
 * Connects to the search-rules Edge Function for AI-powered
 * natural language search of AKC Scent Work regulations.
 */

export interface RuleSearchRequest {
  query: string;
  limit?: number;
  level?: 'Novice' | 'Advanced' | 'Excellent' | 'Master';
  element?: 'Container' | 'Interior' | 'Exterior' | 'Buried';
  organizationCode?: string;  // 'AKC', 'UKC', etc.
  sportCode?: string;          // 'scent-work', 'nosework', etc.
}

export interface QueryAnalysis {
  searchTerms: string;
  filters: {
    level?: string;
    element?: string;
  };
  intent: string;
}

export interface Rule {
  id: string;
  section: string;
  title: string;
  content: string;
  categories: {
    level?: string;
    element?: string;
  };
  keywords: string[];
  measurements: Record<string, any>;
}

export interface RuleSearchResponse {
  query: string;
  analysis: QueryAnalysis;
  answer: string;
  results: Rule[];
  count: number;
}

export interface RulesServiceError {
  message: string;
  code?: string;
  statusCode?: number;
}

// Simple in-memory cache for recent searches
const searchCache = new Map<string, { response: RuleSearchResponse; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Service for searching AKC Scent Work rules using AI-powered natural language queries
 */
export class RulesService {

  /**
   * Search rules using natural language query
   *
   * @param request - Search query and optional filters
   * @returns Search results with AI analysis
   * @throws RulesServiceError on failure
   *
   * @example
   * const results = await RulesService.searchRules({
   *   query: "what is the area size for exterior advanced?"
   * });
   */
  static async searchRules(
    request: RuleSearchRequest
  ): Promise<RuleSearchResponse> {
    const { query, limit = 5, level, element, organizationCode, sportCode } = request;

    // Validate query
    if (!query || query.trim().length === 0) {
      throw {
        message: 'Search query is required',
        code: 'INVALID_QUERY',
        statusCode: 400,
      } as RulesServiceError;
    }

    // Check cache (include org and sport in cache key)
    const cacheKey = JSON.stringify({ query: query.toLowerCase(), limit, level, element, organizationCode, sportCode });
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
return cached.response;
    }

try {
      // Call the Edge Function
      const { data, error } = await supabase.functions.invoke<RuleSearchResponse>(
        'search-rules-v2',
        {
          body: { query, limit, level, element, organizationCode, sportCode },
        }
      );

      if (error) {
        logger.error('📚 [RulesService] Edge Function error:', error);
        throw {
          message: error.message || 'Failed to search rules',
          code: 'EDGE_FUNCTION_ERROR',
          statusCode: error.status || 500,
        } as RulesServiceError;
      }

      if (!data) {
        throw {
          message: 'No data returned from search',
          code: 'NO_DATA',
          statusCode: 500,
        } as RulesServiceError;
      }

      // Cache the response
      searchCache.set(cacheKey, {
        response: data,
        timestamp: Date.now(),
      });

      // Clean up old cache entries (keep last 20 searches)
      if (searchCache.size > 20) {
        const entries = Array.from(searchCache.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        const toDelete = entries.slice(0, entries.length - 20);
        toDelete.forEach(([key]) => searchCache.delete(key));
      }

return data;

    } catch (error) {
      // If it's already a RulesServiceError, rethrow it
      const err = error as { code?: string; message?: string };
      if (err.code && err.message) {
        throw error as RulesServiceError;
      }

      // Otherwise, wrap it
      logger.error('📚 [RulesService] Unexpected error:', error);
      throw {
        message: err.message || 'An unexpected error occurred',
        code: 'UNEXPECTED_ERROR',
        statusCode: 500,
      } as RulesServiceError;
    }
  }

  /**
   * Get a specific rule by ID
   *
   * @param ruleId - The rule ID to fetch
   * @returns The rule details
   */
  static async getRuleById(ruleId: string): Promise<Rule | null> {
    try {
const { data, error } = await supabase
        .from('rules')
        .select('id, section, title, content, categories, keywords, measurements')
        .eq('id', ruleId)
        .single();

      if (error) {
        logger.error('📚 [RulesService] Error fetching rule:', error);
        return null;
      }

      return data as Rule;
    } catch (error) {
      logger.error('📚 [RulesService] Unexpected error fetching rule:', error);
      return null;
    }
  }

  /**
   * Get all rules for a specific level and element combination
   *
   * @param level - The level (Novice, Advanced, Excellent, Master)
   * @param element - The element (Container, Interior, Exterior, Buried)
   * @returns Array of matching rules
   */
  static async getRulesByLevelAndElement(
    level: string,
    element: string
  ): Promise<Rule[]> {
    try {
const { data, error } = await supabase
        .from('rules')
        .select('id, section, title, content, categories, keywords, measurements')
        .eq('categories->>level', level)
        .eq('categories->>element', element);

      if (error) {
        logger.error('📚 [RulesService] Error fetching rules:', error);
        return [];
      }

      return (data || []) as Rule[];
    } catch (error) {
      logger.error('📚 [RulesService] Unexpected error fetching rules:', error);
      return [];
    }
  }

  /**
   * Clear the search cache
   */
  static clearCache(): void {
    searchCache.clear();
}

  /**
   * Clear cache for a specific query
   */
  static clearCacheForQuery(query: string): void {
    // Find and delete all cache entries that match this query
    const keysToDelete: string[] = [];
    for (const key of searchCache.keys()) {
      try {
        const parsed = JSON.parse(key);
        if (parsed.query === query.toLowerCase()) {
          keysToDelete.push(key);
        }
      } catch {
        // Invalid key, skip
      }
    }

    keysToDelete.forEach(key => searchCache.delete(key));
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): { size: number; keys: string[] } {
    return {
      size: searchCache.size,
      keys: Array.from(searchCache.keys()),
    };
  }
}
