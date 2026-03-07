/**
 * PredictivePrefetcher Helper Functions
 *
 * Pure/stateless helpers for pattern storage, search predictions,
 * size estimation, query expansion, and pattern cleanup.
 */

import { logger } from '@/services/LoggingService';
import type {
  NavigationPattern,
  EntityAccessPattern,
  PrefetchRule,
  SearchPrediction,
  QueryExpansion,
} from './PredictivePrefetcher.types';

// ── Storage keys ───────────────────────────────────────────────────

const STORAGE_KEY_NAV = 'myk9show-nav-patterns';
const STORAGE_KEY_ENTITY = 'myk9show-entity-patterns';
const STORAGE_KEY_RULES = 'myk9show-prefetch-rules';

// ── Route-to-entity mapping ────────────────────────────────────────

export const ROUTE_ENTITY_MAP: Record<string, { type: string; pattern: string }[]> = {
  '/shows': [{ type: 'show', pattern: 'upcoming' }],
  '/dogs': [{ type: 'dog', pattern: 'recent' }],
  '/people': [{ type: 'person', pattern: 'frequent' }],
  '/clubs': [{ type: 'club', pattern: 'member' }],
};

// ── Size estimation ────────────────────────────────────────────────

const ENTITY_SIZES: Record<string, number> = {
  person: 2 * 1024, // 2KB
  dog: 5 * 1024, // 5KB with health records
  show: 10 * 1024, // 10KB with trials and classes
  club: 3 * 1024, // 3KB
  entry: 1 * 1024, // 1KB
};

/**
 * Estimate entity size for prefetch planning
 */
export function estimateEntitySize(entityType: string): number {
  return ENTITY_SIZES[entityType] || 1024;
}

/**
 * Estimate search result size based on entity type and query length
 */
export function estimateSearchResultSize(entityType: string, query: string): number {
  const baseSize = estimateEntitySize(entityType);
  const estimatedResults = Math.max(5, Math.min(20, 15 - query.length));
  return baseSize * estimatedResults;
}

// ── Search predictions ─────────────────────────────────────────────

/** Breed keywords used for dog search query expansion */
const BREED_KEYWORDS = ['golden', 'lab', 'shepherd', 'poodle', 'retriever'];

/**
 * Generate query expansions based on patterns
 */
export function generateQueryExpansions(query: string): QueryExpansion[] {
  const expansions: QueryExpansion[] = [];

  // Common patterns
  if (query.length >= 3) {
    // Partial match expansions
    expansions.push({
      query: `${query}*`,
      confidence: 0.8,
      estimatedSize: 1024 * 5,
    });

    // Fuzzy match expansions
    expansions.push({
      query: `~${query}`,
      confidence: 0.6,
      estimatedSize: 1024 * 3,
    });
  }

  // Breed-specific expansions for dog searches
  const lowerQuery = query.toLowerCase();
  BREED_KEYWORDS.forEach(breed => {
    if (lowerQuery.includes(breed)) {
      expansions.push({
        query: `breed:${breed}`,
        confidence: 0.7,
        estimatedSize: 1024 * 8,
      });
    }
  });

  return expansions;
}

/**
 * Generate search predictions based on query patterns
 */
export function generateSearchPredictions(query: string, entityType?: string): SearchPrediction[] {
  const predictions: SearchPrediction[] = [];

  // Query expansion predictions
  const expansions = generateQueryExpansions(query);
  expansions.forEach(expansion => {
    predictions.push({
      entityType: entityType || 'person',
      query: expansion.query,
      confidence: expansion.confidence,
      estimatedSize: expansion.estimatedSize,
    });
  });

  // Cross-entity predictions
  if (!entityType) {
    ['person', 'dog', 'show', 'club'].forEach(type => {
      predictions.push({
        entityType: type,
        query,
        confidence: 0.6,
        estimatedSize: estimateSearchResultSize(type, query),
      });
    });
  }

  return predictions.filter(p => p.confidence > 0.4);
}

// ── Pattern persistence ────────────────────────────────────────────

/**
 * Load navigation patterns from localStorage
 */
export function loadNavigationPatterns(): Map<string, NavigationPattern> {
  const result = new Map<string, NavigationPattern>();
  try {
    const data = localStorage.getItem(STORAGE_KEY_NAV);
    if (data) {
      const parsed = JSON.parse(data);
      parsed.forEach((item: [string, NavigationPattern & { lastAccessed: string }]) => {
        result.set(item[0], {
          ...item[1],
          lastAccessed: new Date(item[1].lastAccessed),
        });
      });
    }
  } catch (error) {
    logger.warn('Failed to load nav patterns from storage', 'prefetch', {}, error as Error);
  }
  return result;
}

/**
 * Load entity access patterns from localStorage
 */
export function loadEntityPatterns(): Map<string, EntityAccessPattern> {
  const result = new Map<string, EntityAccessPattern>();
  try {
    const data = localStorage.getItem(STORAGE_KEY_ENTITY);
    if (data) {
      const parsed = JSON.parse(data);
      parsed.forEach((item: [string, EntityAccessPattern & { lastAccessed: string }]) => {
        result.set(item[0], {
          ...item[1],
          lastAccessed: new Date(item[1].lastAccessed),
        });
      });
    }
  } catch (error) {
    logger.warn('Failed to load entity patterns from storage', 'prefetch', {}, error as Error);
  }
  return result;
}

/**
 * Load prefetch rules from localStorage
 */
export function loadPrefetchRules(): PrefetchRule[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY_RULES);
    if (data) {
      return JSON.parse(data).map((rule: Record<string, unknown>) => ({
        ...rule,
        createdAt: new Date(rule.createdAt as string),
        lastUsed: rule.lastUsed ? new Date(rule.lastUsed as string) : undefined,
      })) as PrefetchRule[];
    }
  } catch (error) {
    logger.warn('Failed to load prefetch rules from storage', 'prefetch', {}, error as Error);
  }
  return [];
}

/**
 * Save all patterns and rules to localStorage
 */
export function savePatternsToStorage(
  navigationPatterns: Map<string, NavigationPattern>,
  entityAccessPatterns: Map<string, EntityAccessPattern>,
  prefetchRules: PrefetchRule[]
): void {
  try {
    localStorage.setItem(STORAGE_KEY_NAV, JSON.stringify(Array.from(navigationPatterns.entries())));
    localStorage.setItem(
      STORAGE_KEY_ENTITY,
      JSON.stringify(Array.from(entityAccessPatterns.entries()))
    );
    localStorage.setItem(STORAGE_KEY_RULES, JSON.stringify(prefetchRules));
  } catch (error) {
    logger.warn('Failed to save prefetch patterns to storage', 'prefetch', {}, error as Error);
  }
}

/**
 * Remove patterns from localStorage
 */
export function clearPatternsFromStorage(): void {
  localStorage.removeItem(STORAGE_KEY_NAV);
  localStorage.removeItem(STORAGE_KEY_ENTITY);
  localStorage.removeItem(STORAGE_KEY_RULES);
}

// ── Pattern cleanup ────────────────────────────────────────────────

/**
 * Remove old navigation and entity patterns to prevent unbounded growth.
 * Mutates the provided maps in place and returns whether anything was removed.
 */
export function cleanupOldPatterns(
  navigationPatterns: Map<string, NavigationPattern>,
  entityAccessPatterns: Map<string, EntityAccessPattern>
): boolean {
  const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
  let removed = false;

  navigationPatterns.forEach((pattern, key) => {
    if (pattern.lastAccessed < cutoffDate && pattern.frequency < 3) {
      navigationPatterns.delete(key);
      removed = true;
    }
  });

  entityAccessPatterns.forEach((pattern, key) => {
    if (pattern.lastAccessed < cutoffDate && pattern.accessCount < 5) {
      entityAccessPatterns.delete(key);
      removed = true;
    }
  });

  return removed;
}

// ── Rule management ────────────────────────────────────────────────

/**
 * Default prefetch rules applied on initialization
 */
export const DEFAULT_PREFETCH_RULES: Omit<PrefetchRule, 'id' | 'createdAt' | 'successRate'>[] = [
  {
    trigger: 'route_change',
    condition: 'route:/shows',
    action: 'prefetch_entity',
    priority: 'high',
    enabled: true,
  },
  {
    trigger: 'entity_access',
    condition: 'entityType:person',
    action: 'prefetch_related',
    priority: 'medium',
    enabled: true,
  },
  {
    trigger: 'search_query',
    condition: 'length:>=3',
    action: 'prefetch_search_results',
    priority: 'medium',
    enabled: true,
  },
  {
    trigger: 'time_based',
    condition: 'idle:>5000',
    action: 'prefetch_entity',
    priority: 'low',
    enabled: true,
  },
];

/**
 * Update rule success rates and disable underperforming rules.
 * Mutates the rules array in place.
 */
export function updateRuleSuccessRates(rules: PrefetchRule[], success: boolean): void {
  const relevantRules = rules.filter(rule => rule.enabled);
  relevantRules.forEach(rule => {
    if (success) {
      rule.successRate = Math.min(1, rule.successRate + 0.05);
      rule.lastUsed = new Date();
    } else {
      rule.successRate = Math.max(0, rule.successRate - 0.02);
    }
  });

  // Disable rules with consistently low success rates
  rules.forEach(rule => {
    if (rule.successRate < 0.2 && rule.lastUsed) {
      const daysSinceLastUse = (Date.now() - rule.lastUsed.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastUse > 7) {
        rule.enabled = false;
      }
    }
  });
}
