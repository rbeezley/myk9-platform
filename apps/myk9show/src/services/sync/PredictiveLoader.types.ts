/**
 * Types for the PredictiveLoader service
 */

/**
 * Navigation pattern for tracking user movement between routes
 */
export interface NavigationPattern {
  fromRoute: string;
  toRoute: string;
  frequency: number;
  avgLoadTime: number;
  lastAccessed: Date;
  confidence: number;
}

/**
 * Preload task for managing what to load and when
 */
export interface PreloadTask {
  id: string;
  type: 'route' | 'entity' | 'relationship' | 'search_results';
  target: string;
  priority: 'high' | 'medium' | 'low';
  estimatedSize: number;
  confidence: number;
  createdAt: Date;
  status: 'pending' | 'loading' | 'completed' | 'failed';
  retries: number;
}

/**
 * Show entry prediction based on historical patterns
 */
export interface ShowEntryPrediction {
  showId: string;
  showName: string;
  dogId: string;
  dogName: string;
  classes: string[];
  confidence: number;
  reasoning: string[];
  estimatedEntryDate: Date;
}

/**
 * Relationship loading hint for smart preloading
 */
export interface RelationshipHint {
  entityType: 'club' | 'person' | 'dog' | 'show' | 'entry';
  entityId: string;
  relatedType: 'club' | 'person' | 'dog' | 'show' | 'entry';
  relatedIds: string[];
  strength: number; // 0-1, how strongly related
  lastAccessed: Date;
}

/** Entity type union used in relationship tracking */
export type EntityType = 'club' | 'person' | 'dog' | 'show' | 'entry';

/** Route entity type for URL matching */
export type RouteEntityType = 'clubs' | 'people' | 'dogs' | 'shows';
