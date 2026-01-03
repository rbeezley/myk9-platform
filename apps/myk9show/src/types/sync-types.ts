// Core synchronization types for Local-First architecture
// Re-exports from centralized type system

import { SyncMetadata, SyncableEntity, SyncStatus } from './core-types';
import { BaseConflict, SyncConflict as UnifiedSyncConflict, BaseConflictResolution, ResolutionStrategy, EnhancedConflictResolution } from './conflict-types';

// Re-export core types for backward compatibility
export type { SyncMetadata, SyncableEntity, SyncStatus };

export interface SyncAction {
  id: string;
  entityType: 'club' | 'person' | 'dog' | 'show' | 'trial' | 'class' | 'entry' | 'trial_class';
  actionType: 'create' | 'update' | 'delete';
  entityId: string;
  data: Record<string, unknown>;
  timestamp: Date;
  userId: string;
  retries: number;
  lastError?: string;
}

// Alias for backward compatibility and external integrations
export type SyncOperation = {
  id: string;
  entityType: string;
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  data: unknown;
  timestamp: number;
  clientId: string;
  version: number;
};

// Sync payload for compression service integration
export interface SyncPayload {
  version: string;
  timestamp: number;
  operations?: SyncOperation[];
  metadata?: Record<string, unknown>;
}

// Use unified conflict system
export type SyncConflict = UnifiedSyncConflict;

export interface SyncQueueItem {
  id: string;
  entityType: 'club' | 'person' | 'dog' | 'show' | 'trial' | 'class' | 'entry' | 'trial_class';
  actionType: 'create' | 'update' | 'delete';
  entityId: string;
  data: Record<string, unknown>;
  timestamp: Date;
  userId: string;
  retries: number;
  lastError?: string;
  priority: number;
  scheduledFor: Date;
  processedAt?: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retryCount: number;
}

export interface SyncMetrics {
  syncSuccessRate: number;
  averageSyncTime: number;
  conflictRate: number;
  offlineUsageTime: number;
  queueSize: number;
  lastSyncAt?: Date;
}

export interface SyncScope {
  entityTypes: {
    people: 'none' | 'own' | 'search-cache' | 'all';
    dogs: 'none' | 'own' | 'by-entry' | 'search-cache' | 'all';
    shows: 'none' | 'upcoming' | 'entered' | 'assigned' | 'managing';
    trials: 'none' | 'show-specific' | 'assigned' | 'all';
    classes: 'none' | 'trial-specific' | 'assigned' | 'all';
    entries: 'none' | 'own' | 'class-specific' | 'show-specific' | 'all';
  };
  timeRange?: { start: Date; end: Date };
  maxRecords?: number;
  geoScope?: { radius: number; center: [lat: number, lon: number] };
}

export interface SyncScopeConfig {
  scope: string;
  limit: number;
}

export interface RoleSyncScopes {
  NEW_USER: {
    people: SyncScopeConfig;
    dogs: SyncScopeConfig;
    shows: SyncScopeConfig;
    trials: SyncScopeConfig;
    classes: SyncScopeConfig;
    entries: SyncScopeConfig;
  };
  EXHIBITOR: {
    people: SyncScopeConfig;
    dogs: SyncScopeConfig;
    shows: SyncScopeConfig;
    trials: SyncScopeConfig;
    classes: SyncScopeConfig;
    entries: SyncScopeConfig;
  };
  JUDGE: {
    people: SyncScopeConfig;
    dogs: SyncScopeConfig;
    shows: SyncScopeConfig;
    trials: SyncScopeConfig;
    classes: SyncScopeConfig;
    entries: SyncScopeConfig;
  };
  SECRETARY: {
    people: SyncScopeConfig;
    dogs: SyncScopeConfig;
    shows: SyncScopeConfig;
    trials: SyncScopeConfig;
    classes: SyncScopeConfig;
    entries: SyncScopeConfig;
  };
  ADMIN: {
    people: SyncScopeConfig;
    dogs: SyncScopeConfig;
    shows: SyncScopeConfig;
    trials: SyncScopeConfig;
    classes: SyncScopeConfig;
    entries: SyncScopeConfig;
  };
}

export interface SyncProgress {
  entity: string;
  total: number;
  completed: number;
  status: 'pending' | 'syncing' | 'completed' | 'error';
  message?: string;
}

export interface StorageInfo {
  used: number;
  available: number;
  percentage: number;
}

// Use unified resolution system
export type ConflictResolution = BaseConflictResolution;

// Use unified conflict system for Phase 4 UI
export type Conflict = BaseConflict;

// Use unified resolution strategy
export type { ResolutionStrategy };

// Use unified enhanced resolution
export type { EnhancedConflictResolution };

export interface ConflictSuggestion {
  strategy: ResolutionStrategy;
  confidence: number;
  reason: string;
  suggestedData?: Record<string, unknown>;
}

export interface FieldSuggestion {
  value: unknown;
  label: string;
  confidence: number;
  reason: string;
}

export type UserRole = 'NEW_USER' | 'EXHIBITOR' | 'JUDGE' | 'SECRETARY' | 'ADMIN';

// Network state types
export type NetworkQuality = 'offline' | 'slow' | 'good' | 'excellent';

export interface NetworkState {
  isOnline: boolean;
  quality: NetworkQuality;
  lastChecked: Date;
  bandwidth?: number; // in Mbps
}

// Sync events for real-time updates
export interface SyncEvent {
  type: 'sync-started' | 'sync-completed' | 'sync-failed' | 'conflict-detected' | 'conflict-resolved' | 'connection-restored' | 'connection-lost' | 'storage-warning' | 'operation-queued';
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}