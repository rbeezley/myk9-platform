// Core conflict resolution services
export { 
  ConflictResolver,
  ConflictType,
  ConflictPriority,
  ResolutionStrategy,
  type Conflict,
  type ConflictResolution,
  type ConflictDetail,
  type ResolutionContext,
  type EntityResolutionConfig,
  type BusinessRule,
  conflictResolver
} from './ConflictResolver';

export {
  ConflictDetector,
  conflictDetector,
  type ConflictDetectionResult,
  type FieldComparisonOptions
} from './ConflictDetector';

export {
  ConflictManager,
  conflictManager,
  type ConflictManagerOptions,
  type ConflictStats,
  type ConflictNotification,
  type ConflictEvent,
  type ConflictEventType,
  type ConflictEventHandler
} from './ConflictManager';