// Sync service exports for Phase 6 implementation
export { syncService } from './syncService';
export { EventEmitter } from './eventEmitter';
export { SyncConflictResolver } from './SyncConflictResolver';
export { SyncQueue } from './SyncQueue';
export { QueueManager } from './queueManager';
export { RealtimeManager } from './realtimeManager';
export { NetworkMonitor } from './networkMonitor';

// Performance optimization services
export { DifferentialSyncService } from './DifferentialSyncService';
export { CompressionService } from '../compression/CompressionService';
export { BatchProcessor } from './BatchProcessor';
export { FieldLevelSyncService, fieldLevelSync } from './FieldLevelSyncService';

// Export all types
export type {
  SyncableEntity,
  SyncMetadata,
  FieldChange,
  SyncStatus,
  SyncQueueItem,
  SyncOperation,
  Conflict,
  ConflictResolution,
  ResolutionStrategy,
  FieldResolution,
  SyncSession,
  SyncStatistics,
  SyncConfiguration,
  NetworkStatus,
  SyncEvent,
  SyncEventType,
  SyncMetadataRecord,
  SyncQueueRecord,
  ConflictRecord,
  SyncSessionRecord,
  SyncService,
  SyncableEntityType
} from './types';

export { SYNCABLE_ENTITIES, DEFAULT_SYNC_PRIORITIES, SyncEvents } from './types';