/**
 * Sync configuration types for selective sync and scope management
 * Phase 5.1.1: Selective Sync Configuration
 */

/**
 * Configuration for selective sync operations
 * Controls which data is synchronized and how
 */
export interface SelectiveSync {
  /** Only sync data that has changed since last sync */
  syncOnlyChanged: boolean;

  /** Enable delta synchronization for bandwidth optimization */
  deltaSync: boolean;

  /** Enable compression for sync payloads */
  compressionEnabled: boolean;

  /** Number of records to sync in a single batch */
  batchSize: number;

  /** Scope configuration for selective data sync */
  scope?: SyncScope;

  /** Priority configuration for sync operations */
  priority?: SyncPriority;
}

/**
 * Scope configuration for selective sync
 * Defines which entities and fields to include in sync
 */
export interface SyncScope {
  /** Entities to include in sync */
  entities: EntitySyncConfig[];

  /** Time-based filtering */
  timeRange?: TimeRangeFilter;

  /** User-based filtering */
  userScope?: UserScopeFilter;

  /** Location-based filtering */
  locationScope?: LocationScopeFilter;
}

/**
 * Configuration for entity-level sync
 */
export interface EntitySyncConfig {
  /** Entity type (e.g., 'dogs', 'people', 'shows') */
  entityType: string;

  /** Fields to include in sync (null = all fields) */
  fields?: string[] | null;

  /** Filter conditions for this entity */
  filters?: SyncFilter[];

  /** Relationship depth to sync (0 = no relationships) */
  relationshipDepth?: number;
}

/**
 * Filter configuration for sync operations
 */
export interface SyncFilter {
  /** Field to filter on */
  field: string;

  /** Filter operator */
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';

  /** Filter value */
  value: unknown;
}

/**
 * Time-based filtering for sync operations
 */
export interface TimeRangeFilter {
  /** Only sync records modified after this date */
  modifiedAfter?: Date;

  /** Only sync records modified before this date */
  modifiedBefore?: Date;

  /** Only sync records created after this date */
  createdAfter?: Date;

  /** Only sync records created before this date */
  createdBefore?: Date;
}

/**
 * User-based filtering for sync operations
 */
export interface UserScopeFilter {
  /** Only sync data for specific user IDs */
  userIds?: string[];

  /** Only sync data for specific roles */
  roles?: string[];

  /** Only sync data the current user has access to */
  currentUserOnly?: boolean;
}

/**
 * Location-based filtering for sync operations
 */
export interface LocationScopeFilter {
  /** Geographic regions to include */
  regions?: string[];

  /** Specific venue IDs to include */
  venueIds?: string[];

  /** Radius-based filtering */
  radius?: {
    center: { lat: number; lng: number };
    distanceKm: number;
  };
}

/**
 * Sync priority levels
 */
export enum SyncPriority {
  /** Critical data that must sync immediately */
  CRITICAL = 'critical',

  /** High priority data */
  HIGH = 'high',

  /** Normal priority data */
  NORMAL = 'normal',

  /** Low priority data that can sync when idle */
  LOW = 'low',

  /** Background sync only when on WiFi */
  BACKGROUND = 'background'
}

/**
 * Configuration for field-level sync
 * Allows granular control over which fields are synchronized
 */
export interface FieldLevelSyncConfig {
  /** Default behavior for unlisted fields */
  defaultBehavior: 'include' | 'exclude';

  /** Field-specific sync rules */
  fieldRules: FieldSyncRule[];

  /** Enable automatic field detection based on usage */
  autoDetection: boolean;

  /** Track field access patterns for optimization */
  trackFieldUsage: boolean;

  /** Compress large text fields automatically */
  compressLargeFields: boolean;

  /** Threshold for large field compression (characters) */
  largeFieldThreshold: number;
}

/**
 * Sync rule for individual fields
 */
export interface FieldSyncRule {
  /** Entity type this rule applies to */
  entityType: string;

  /** Field path (supports nested fields with dot notation) */
  fieldPath: string;

  /** Sync behavior for this field */
  behavior: 'always' | 'never' | 'conditional' | 'lazy';

  /** Condition for conditional sync */
  condition?: FieldSyncCondition;

  /** Transform function for field value */
  transform?: 'compress' | 'encrypt' | 'hash' | 'truncate';

  /** Priority for this field */
  priority?: SyncPriority;
}

/**
 * Condition for field-level sync
 */
export interface FieldSyncCondition {
  /** Condition type */
  type: 'size' | 'age' | 'frequency' | 'device' | 'network';

  /** Condition parameters */
  params: Record<string, unknown>;
}

/**
 * Configuration for priority queue sync
 * Ensures important data syncs first
 */
export interface PriorityQueueConfig {
  /** Enable priority-based sync */
  enabled: boolean;

  /** Queue implementation */
  implementation: 'heap' | 'bucket' | 'weighted';

  /** Maximum queue size */
  maxQueueSize: number;

  /** Priority calculation rules */
  priorityRules: PriorityRule[];

  /** Enable dynamic priority adjustment */
  dynamicPriority: boolean;

  /** Starvation prevention for low priority items */
  starvationPrevention: StarvationPreventionConfig;
}

/**
 * Rule for calculating sync priority
 */
export interface PriorityRule {
  /** Rule identifier */
  id: string;

  /** Entity types this rule applies to */
  entityTypes: string[];

  /** Base priority for matching items */
  basePriority: number;

  /** Conditions that modify priority */
  modifiers: PriorityModifier[];
}

/**
 * Modifier for priority calculation
 */
export interface PriorityModifier {
  /** Condition for applying modifier */
  condition: string;

  /** Priority adjustment (+/- value) */
  adjustment: number;

  /** Whether this modifier can stack with others */
  stackable: boolean;
}

/**
 * Configuration for preventing starvation of low priority items
 */
export interface StarvationPreventionConfig {
  /** Enable starvation prevention */
  enabled: boolean;

  /** Maximum time an item can wait (ms) */
  maxWaitTime: number;

  /** Priority boost per time unit */
  priorityBoostRate: number;

  /** Maximum priority boost */
  maxBoost: number;
}
