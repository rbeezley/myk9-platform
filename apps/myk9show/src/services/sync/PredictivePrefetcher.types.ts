/**
 * PredictivePrefetcher Type Definitions
 *
 * Interfaces for navigation patterns, entity access tracking,
 * prefetch rules, and prefetch tasks.
 */

export interface NavigationPattern {
  fromRoute: string;
  toRoute: string;
  frequency: number;
  avgTimeSpent: number;
  lastAccessed: Date;
}

export interface EntityAccessPattern {
  entityType: 'club' | 'person' | 'dog' | 'show' | 'entry';
  entityId: string;
  accessCount: number;
  lastAccessed: Date;
  contextualAccess: string[]; // Routes where this entity was accessed
  relatedEntities: string[]; // Entities accessed together
}

export interface PrefetchRule {
  id: string;
  trigger: 'route_change' | 'entity_access' | 'time_based' | 'search_query';
  condition: string; // Pattern or condition to match
  action: 'prefetch_entity' | 'prefetch_related' | 'prefetch_search_results';
  priority: 'high' | 'medium' | 'low';
  enabled: boolean;
  successRate: number; // How often this rule was useful
  createdAt: Date;
  lastUsed?: Date;
}

export interface PrefetchTask {
  id: string;
  entityType: string;
  entityId?: string;
  searchQuery?: string;
  priority: number;
  estimatedSize: number;
  createdAt: Date;
  timeout: number;
  retries: number;
}

export interface SearchPrediction {
  entityType: string;
  query: string;
  confidence: number;
  estimatedSize: number;
}

export interface QueryExpansion {
  query: string;
  confidence: number;
  estimatedSize: number;
}

export interface PrefetchAnalytics {
  navigationPatterns: number;
  entityPatterns: number;
  activeRules: number;
  pendingPrefetches: number;
  queuedPrefetches: number;
}
