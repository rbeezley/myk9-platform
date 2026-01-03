/**
 * Simplified type definitions for sync services
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type AnyRecord = Record<string, any>;

export interface CompressedData {
  data: unknown;
  compressed: boolean;
  originalSize: number;
  compressedSize: number;
  timestamp: Date;
  algorithm: string;
  _isCompressed: true;
}

// Network and sync status types
export interface NetworkStatus {
  online: boolean;
  connectionType: string;
  effectiveType: string;
  downlink: number;
  rtt: number;
  quality: 'poor' | 'good' | 'excellent';
}

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

// Sync configuration and entities
export type SyncableEntityType = 'dog' | 'person' | 'show' | 'entry' | 'trial' | 'class';

export interface SyncableEntity {
  id: string;
  type: SyncableEntityType;
  data: any;
  lastModified: Date;
}

export interface SyncMetadata {
  lastSync: Date;
  version: number;
  hash: string;
  source: 'local' | 'remote';
}

export interface SyncMetadataRecord {
  id: string;
  entityType: SyncableEntityType;
  entityId: string;
  metadata: SyncMetadata;
}

// Queue and sync items
export interface SyncQueueItem {
  id: string;
  type: 'create' | 'update' | 'delete';
  entity: SyncableEntityType;
  entityId: string;
  data?: any;
  priority: 'low' | 'medium' | 'high' | 'critical';
  attempts: number;
  lastAttempt?: Date;
  scheduledFor?: Date;
}

export interface SyncQueueRecord extends SyncQueueItem {
  createdAt: Date;
  updatedAt: Date;
}

// Conflicts and resolution
export interface FieldChange {
  field: string;
  oldValue: any;
  newValue: any;
  timestamp: Date;
}

export interface Conflict {
  id: string;
  entityType: SyncableEntityType;
  entityId: string;
  localData: any;
  remoteData: any;
  conflicts: FieldChange[];
  createdAt: Date;
}

export interface ConflictResolution {
  conflictId: string;
  resolution: 'local' | 'remote' | 'merge' | 'manual';
  resolvedData?: any;
  resolvedAt: Date;
  resolvedBy: string;
}

export interface ConflictRecord extends Conflict {
  resolution?: ConflictResolution;
  status: 'pending' | 'resolved';
}

// Sync sessions and service
export interface SyncSession {
  id: string;
  startedAt: Date;
  endedAt?: Date;
  status: 'running' | 'completed' | 'failed';
  itemsProcessed: number;
  itemsFailed: number;
  conflictsFound: number;
}

export interface SyncSessionRecord extends SyncSession {
  logs: string[];
}

export interface SyncConfiguration {
  batchSize: number;
  retryAttempts: number;
  retryDelay: number;
  conflictResolution: 'auto' | 'manual';
  enableRealtime: boolean;
}

export interface SyncStatistics {
  lastSyncAt?: Date;
  totalSynced: number;
  totalConflicts: number;
  totalErrors: number;
  averageSyncTime: number;
}

// Events
export type SyncEventType = 
  | 'sync_started'
  | 'sync_completed'
  | 'sync_failed'
  | 'conflict_detected'
  | 'conflict_resolved'
  | 'network_changed'
  | 'queue_updated';

export interface SyncEvent {
  type: SyncEventType;
  timestamp: Date;
  data?: any;
}

export interface SyncEventMap {
  sync_started: SyncEvent;
  sync_completed: SyncEvent;
  sync_failed: SyncEvent;
  conflict_detected: SyncEvent;
  conflict_resolved: SyncEvent;
  network_changed: SyncEvent;
  queue_updated: SyncEvent;
}

export interface SyncEvents {
  [K in SyncEventType]: SyncEvent;
}

// Service interface
export interface SyncService {
  start(): Promise<void>;
  stop(): Promise<void>;
  sync(): Promise<void>;
  getStatus(): SyncStatus;
  getStatistics(): SyncStatistics;
  getConfiguration(): SyncConfiguration;
  updateConfiguration(config: Partial<SyncConfiguration>): Promise<void>;
}

// Constants
export const SYNCABLE_ENTITIES: SyncableEntityType[] = ['dog', 'person', 'show', 'entry', 'trial', 'class'];

export const DEFAULT_SYNC_PRIORITIES: Record<SyncableEntityType, 'low' | 'medium' | 'high' | 'critical'> = {
  dog: 'high',
  person: 'medium',
  show: 'critical',
  entry: 'high',
  trial: 'high',
  class: 'medium'
};