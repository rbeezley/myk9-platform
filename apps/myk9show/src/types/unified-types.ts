/**
 * Unified Type System Index
 * 
 * This file serves as the main entry point for all types in the application.
 * It re-exports all core types to provide a clean, centralized import interface.
 */

// ============================================================================
// Core System Types
// ============================================================================

// Re-export all core types
export * from './core-types';

// Re-export all conflict types
export * from './conflict-types';

// ============================================================================
// Domain-Specific Types
// ============================================================================

// Dog-related types
export type {
  Dog,
  Registration,
  Owner,
  DogInput,
  PersonInput
} from './dog-types';

// User-related types
export type {
  User,
  UserRole,
  JudgeQualification,
  JudgeCertification,
  JudgeInfo,
  Handler,
  Judge,
  Exhibitor
} from './user-types';

// Show and competition types
export type {
  Show,
  ShowTrial,
  Class,
  Trial,
  ShowInput,
  ShowStat
} from './show-types';

// Judge-related types
export type {
  ShowJudgeAssignment,
  LegacyJudgeAssignment
} from './judge-types';

// Auth and permissions
export type {
  Permission,
  Scope,
  RoleScope,
  UserWithRoles,
  PermissionChecker,
  RBACContextState
} from './auth-types';

// Scoring system types
export type {
  Score,
  ScoringFormat,
  BaseScore,
  ScoringConflict,
  JudgePresence,
  PlacementUpdate
} from './scoring-types';

// Scent work specific
export type {
  ScentWorkResult,
  MultiAreaScentWorkResult,
  ScentWorkEntry,
  ScentWorkClassConfig,
  QualificationStatus,
  NQReason
} from './scent-work-types';

// Check-in and offline types
export type {
  CheckInStatus,
  CheckInStatusConfig,
  CheckInInfo
} from './check-in-types';

// Sync and conflict resolution (legacy compatibility)
export type {
  SyncMetadata,
  SyncableEntity,
  SyncStatus,
  SyncAction,
  SyncQueueItem,
  SyncConflict,
  ConflictResolution,
  EnhancedConflictResolution,
  ResolutionStrategy
} from './sync-types';

// ============================================================================
// Utility Types and Type Guards
// ============================================================================

// Re-export utility types from core-types
export type {
  BaseEntity,
  SoftDeletable,
  Auditable,
  PaginatedResponse,
  QueryOptions,
  Result,
  Success,
  Failure,
  AppError,
  ValidationResult,
  ValidationError,
  DeepPartial,
  RequireFields,
  WithoutSync,
  CreateInput,
  UpdateInput
} from './core-types';

// Re-export conflict utilities
export type {
  AnyConflict,
  ConflictType,
  ConflictPriority,
  ConflictStatus,
  ConflictMetadata
} from './conflict-types';

// Performance optimization types (Phase 5.1)
export type {
  SelectiveSync,
  DifferentialSyncConfig,
  CompressionConfig,
  BatchProcessingConfig,
  FieldLevelSyncConfig,
  PriorityQueueConfig,
  PerformanceMetrics,
  DeltaPayload,
  DeltaOperation,
  DeltaValidationResult,
  CompressionResult,
  BatchResult
} from './performance-types';

// ============================================================================
// Common aliases
// ============================================================================
export type ID = string;
export type Timestamp = Date;
export type EntityType = 'dog' | 'person' | 'show' | 'class' | 'entry' | 'club' | 'trial';

// ============================================================================
// Type Utility Helpers
// ============================================================================

/**
 * Helper to create a typed ID for entities
 */
export type TypedID<T extends string> = `${T}_${string}`;

/**
 * Helper for making specific fields optional
 */
export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Helper for creating update payloads
 */
export type UpdatePayload<T> = Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>;

/**
 * Type system version for compatibility tracking
 */
export const TYPE_SYSTEM_VERSION = '2.0.0';