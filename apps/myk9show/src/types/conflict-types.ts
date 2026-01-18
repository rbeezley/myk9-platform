/**
 * Unified Conflict Type System
 * 
 * This file provides a centralized, extensible conflict type system to replace
 * the scattered conflict interfaces throughout the codebase. It follows a
 * hierarchical approach with base types and domain-specific extensions.
 */

// ============================================================================
// Base Conflict Types
// ============================================================================

/**
 * Core conflict metadata that applies to all conflict types
 */
export interface BaseConflictMetadata {
  id: string;
  detectedAt: Date;
  createdAt: Date;
  priority: ConflictPriority;
  status: ConflictStatus;
  affectedUsers?: string[];
  deadline?: Date;
  autoResolvable?: boolean;
  requiresManualResolution?: boolean;
}

/**
 * Base conflict interface that all specific conflict types extend
 */
export interface BaseConflict<TData = Record<string, unknown>> extends BaseConflictMetadata {
  conflictType: ConflictType;
  entityType: string;
  entityId: string;
  entityName?: string;
  
  // Data versions involved in conflict
  localData: TData;
  remoteData: TData;
  serverData?: TData; // For three-way conflicts
  baseData?: TData;   // Common ancestor for merge conflicts
  
  // Conflict analysis
  conflictFields: string[];
  fieldPath?: string; // Specific path for nested conflicts
  
  // Modification tracking
  lastModified: {
    local: Date;
    remote: Date;
    server?: Date;
  };
  lastModifiedBy: {
    local: string;
    remote: string;
    server?: string;
  };
  
  // Additional context
  metadata?: ConflictMetadata;
}

// ============================================================================
// Enums and Union Types
// ============================================================================

export type ConflictType = 
  | 'version_mismatch'       // Different versions of same entity
  | 'concurrent_edit'        // Simultaneous modifications
  | 'delete_update'          // One side deleted, other updated
  | 'constraint_violation'   // Business rule violations
  | 'data_mismatch'          // Unexpected data differences
  | 'merge_conflict'         // Git-style merge conflicts
  | 'sync_conflict'          // Synchronization failures
  | 'scoring_conflict'       // Competition scoring conflicts
  | 'schedule_conflict'      // Time/resource scheduling conflicts
  | 'armband_conflict'       // Armband number conflicts
  | 'checkin_conflict'       // Check-in status conflicts
  | 'handler_conflict';      // Handler assignment conflicts

export type ConflictPriority = 'low' | 'medium' | 'high' | 'critical';

export type ConflictStatus = 
  | 'detected'     // Just discovered
  | 'pending'      // Awaiting resolution
  | 'resolving'    // Currently being resolved
  | 'resolved'     // Successfully resolved
  | 'dismissed'    // Ignored/dismissed
  | 'escalated'    // Escalated to higher authority
  | 'expired';     // Resolution deadline passed

// ============================================================================
// Conflict Metadata Extensions
// ============================================================================

export interface ConflictMetadata {
  // Business context
  businessRuleViolation?: string;
  impactLevel?: 'low' | 'medium' | 'high' | 'critical';
  affectedEntities?: Array<{
    type: string;
    id: string;
    name?: string;
  }>;
  
  // Legacy fields for backward compatibility
  autoResolvable?: boolean;
  affectedUsers?: string[];
  deadline?: Date;
  
  // Resolution context
  suggestedResolution?: ResolutionStrategy;
  resolutionConfidence?: number; // 0-1 scale
  previousResolutions?: string[]; // History of similar resolutions
  
  // Escalation
  escalationLevel?: number;
  escalationReason?: string;
  escalatedTo?: string;
  escalatedAt?: Date;
  
  // Timing
  resolutionDeadline?: Date;
  maxRetries?: number;
  retryCount?: number;
  
  // Technical details
  stackTrace?: string;
  debugInfo?: Record<string, unknown>;
}

// ============================================================================
// Domain-Specific Conflict Types
// ============================================================================

/**
 * General sync conflicts between local and remote data
 */
export interface SyncConflict<T = Record<string, unknown>> extends BaseConflict<T> {
  conflictType: 'version_mismatch' | 'concurrent_edit' | 'sync_conflict';
  
  // Sync-specific metadata
  syncMetadata: {
    localVersion: number;
    remoteVersion: number;
    lastSyncedVersion?: number;
    lastSyncedAt?: Date;
    syncAttempts: number;
  };
}

/**
 * Scoring conflicts in competitions
 */
export interface ScoringConflict extends BaseConflict {
  conflictType: 'scoring_conflict';
  entityType: 'score' | 'placement' | 'entry';
  
  // Competition context
  classId: string;
  showId?: string | undefined;
  entryId: string;
  judgeIds: string[];
  
  // Scoring details
  scoringDetails: {
    conflictReason: 'judge_conflict' | 'score_mismatch' | 'placement_conflict' | 'timing_conflict';
    affectedScores: Array<{
      judgeId: string;
      score: unknown;
      timestamp: Date;
    }>;
    currentPlacement?: number;
    expectedPlacement?: number;
  };
}

/**
 * Schedule conflicts for shows, classes, and resources
 */
export interface ScheduleConflict extends BaseConflict {
  conflictType: 'schedule_conflict';
  entityType: 'show' | 'class' | 'judge' | 'ring' | 'resource';
  
  // Scheduling details
  scheduleDetails: {
    conflictReason: 'time_overlap' | 'resource_double_booking' | 'dependency_violation';
    timeSlot: {
      start: Date;
      end: Date;
    };
    conflictingTimeSlot?: {
      start: Date;
      end: Date;
    };
    affectedResources: Array<{
      type: string;
      id: string;
      name: string;
    }>;
  };
}

/**
 * Armband number conflicts
 */
export interface ArmbandConflict extends BaseConflict {
  conflictType: 'armband_conflict';
  entityType: 'entry';
  
  // Armband details
  armbandDetails: {
    conflictingArmband: string;
    proposedAlternatives: string[];
    classId: string;
    conflictingEntryId: string;
    conflictingDogName: string;
    conflictingHandlerName: string;
  };
}

/**
 * Check-in status conflicts
 */
export interface CheckInConflict extends BaseConflict {
  conflictType: 'checkin_conflict';
  entityType: 'entry' | 'exhibitor';
  
  // Check-in details
  checkInDetails: {
    currentStatus: string;
    conflictingStatus: string;
    checkInTime?: Date;
    checkInLocation?: string;
    expectedTime?: Date;
    conflictReason: 'duplicate_checkin' | 'status_mismatch' | 'timing_conflict' | 'location_mismatch';
  };
}

/**
 * Handler assignment conflicts
 */
export interface HandlerConflict extends BaseConflict {
  conflictType: 'handler_conflict';
  entityType: 'entry' | 'dog';
  
  // Handler details
  handlerDetails: {
    currentHandlerId: string;
    conflictingHandlerId: string;
    currentHandlerName: string;
    conflictingHandlerName: string;
    reason: 'double_assignment' | 'eligibility_issue' | 'availability_conflict';
    affectedClasses: string[];
  };
}

// ============================================================================
// Resolution System
// ============================================================================

export type ResolutionStrategy = 
  | 'local_wins'          // Keep local version
  | 'remote_wins'         // Keep remote version
  | 'server_wins'         // Keep server version (for 3-way)
  | 'merge_automatic'     // Auto-merge non-conflicting fields
  | 'merge_manual'        // Manual field-by-field resolution
  | 'newest_wins'         // Use most recently modified
  | 'user_decides'        // Delegate to user choice
  | 'escalate'            // Escalate to authority
  | 'retry_later'         // Defer resolution
  | 'ignore'              // Dismiss conflict
  | 'rollback';           // Revert to previous state

export interface BaseConflictResolution<T = unknown> {
  conflictId: string;
  strategy: ResolutionStrategy;
  resolvedAt: Date;
  resolvedBy: string;
  automatic: boolean;
  
  // Resolution result
  resolvedEntity?: T;
  resolutionNotes?: string;
  confidence?: number; // 0-1 scale for automatic resolutions
  
  // Field-specific resolutions for manual merges
  fieldResolutions?: FieldResolution[];
  
  // Metadata
  resolutionTime?: number; // ms taken to resolve
  retryCount?: number;
  rollbackPossible?: boolean;
}

export interface FieldResolution {
  field: string;
  strategy: 'local' | 'remote' | 'server' | 'manual' | 'computed';
  value: unknown;
  reason?: string;
  confidence?: number;
}

// Enhanced resolution for complex conflicts
export interface EnhancedConflictResolution<T = unknown> extends BaseConflictResolution<T> {
  // Advanced resolution data
  mergePlan?: MergePlan;
  impactAnalysis?: ImpactAnalysis;
  approvalRequired?: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  
  // Learning for future conflicts
  similar_conflicts?: string[]; // IDs of similar past conflicts
  resolution_pattern?: string;  // Pattern for ML learning
  success_metrics?: ResolutionMetrics;
}

export interface MergePlan {
  strategy: 'three_way' | 'two_way' | 'custom';
  baseVersion?: unknown;
  fieldMergeStrategies: Record<string, ResolutionStrategy>;
  customMergeRules?: Array<{
    condition: string;
    action: string;
    priority: number;
  }>;
}

export interface ImpactAnalysis {
  affectedEntities: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  potentialIssues: string[];
  rollbackComplexity: 'easy' | 'moderate' | 'difficult' | 'impossible';
  businessImpact: string;
}

export interface ResolutionMetrics {
  resolutionTime: number;
  userSatisfaction?: number; // 1-5 scale
  automaticResolutionAccuracy?: number; // 0-1 scale
  rollbackRequired?: boolean;
  similarConflictsPrevented?: number;
}

// ============================================================================
// Utility Types and Type Guards
// ============================================================================

// Union type of all specific conflict types
export type AnyConflict = 
  | SyncConflict
  | ScoringConflict
  | ScheduleConflict
  | ArmbandConflict
  | CheckInConflict
  | HandlerConflict
  | BaseConflict;

// Type guards
export function isSyncConflict(conflict: AnyConflict): conflict is SyncConflict {
  return ['version_mismatch', 'concurrent_edit', 'sync_conflict'].includes(conflict.conflictType);
}

export function isScoringConflict(conflict: AnyConflict): conflict is ScoringConflict {
  return conflict.conflictType === 'scoring_conflict';
}

export function isScheduleConflict(conflict: AnyConflict): conflict is ScheduleConflict {
  return conflict.conflictType === 'schedule_conflict';
}

export function isArmbandConflict(conflict: AnyConflict): conflict is ArmbandConflict {
  return conflict.conflictType === 'armband_conflict';
}

export function isCheckInConflict(conflict: AnyConflict): conflict is CheckInConflict {
  return conflict.conflictType === 'checkin_conflict';
}

export function isHandlerConflict(conflict: AnyConflict): conflict is HandlerConflict {
  return conflict.conflictType === 'handler_conflict';
}

// Conflict severity helpers
export function getConflictSeverity(conflict: AnyConflict): 'low' | 'medium' | 'high' | 'critical' {
  // Critical conflicts
  if (conflict.conflictType === 'constraint_violation' || 
      conflict.priority === 'critical' ||
      conflict.metadata?.impactLevel === 'critical') {
    return 'critical';
  }
  
  // High severity
  if (conflict.conflictType === 'scoring_conflict' ||
      conflict.conflictType === 'schedule_conflict' ||
      conflict.priority === 'high') {
    return 'high';
  }
  
  // Medium severity
  if (conflict.conflictType === 'concurrent_edit' ||
      conflict.conflictType === 'version_mismatch' ||
      conflict.priority === 'medium') {
    return 'medium';
  }
  
  return 'low';
}

// Default conflict priorities by type
export const DEFAULT_CONFLICT_PRIORITIES: Record<ConflictType, ConflictPriority> = {
  'constraint_violation': 'critical',
  'scoring_conflict': 'high',
  'schedule_conflict': 'high',
  'delete_update': 'high',
  'concurrent_edit': 'medium',
  'version_mismatch': 'medium',
  'armband_conflict': 'medium',
  'checkin_conflict': 'medium',
  'handler_conflict': 'medium',
  'data_mismatch': 'low',
  'merge_conflict': 'low',
  'sync_conflict': 'low'
};

// ============================================================================
// Legacy Compatibility (Temporary)
// ============================================================================

// Re-export common legacy names for gradual migration
export type { BaseConflict as Conflict };
export type { BaseConflictResolution as ConflictResolution };

// Legacy aliases - to be removed after migration
/** @deprecated Use BaseConflict instead */
export type LegacyConflict = BaseConflict;
/** @deprecated Use BaseConflictResolution instead */
export type LegacyConflictResolution = BaseConflictResolution;