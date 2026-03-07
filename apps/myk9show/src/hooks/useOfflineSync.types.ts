/**
 * Types for Offline Sync React Hook
 * Phase 6.3: Sync & Offline Systems
 */

import type {
  SyncQueueItem,
  SyncConflict,
  ResolutionStrategy,
  NetworkQuality,
} from '../types/sync-types';

export interface UseOfflineSyncOptions {
  autoSync?: boolean;
  enableDrafts?: boolean;
  enableConflictDetection?: boolean;
  syncInterval?: number;
  retryOnFailure?: boolean;
  batchSize?: number;
}

export interface OfflineSyncState {
  isOnline: boolean;
  isOffline: boolean;
  isSyncing: boolean;
  networkQuality: NetworkQuality;
  lastSyncTime: Date | null;
  lastSyncSuccess: boolean;
  pendingOperations: number;
  storageUsed: number;
  storageAvailable: number;
  offlineDuration: number;
}

export interface SyncOperationResult {
  success: boolean;
  operationId: string;
  error?: Error;
  conflicts?: SyncConflict[];
}

export interface DraftState {
  drafts: Map<string, unknown>;
  activeDrafts: number;
  lastDraftSaved: Date | null;
}

export interface ConflictState {
  pendingConflicts: SyncConflict[];
  totalConflicts: number;
  resolvedConflicts: number;
  lastConflictDetected: Date | null;
}

export interface UseOfflineSyncReturn {
  // State
  state: OfflineSyncState;
  draftState: DraftState;
  conflictState: ConflictState;

  // Queue operations
  queueOperation: (
    entityType: string,
    actionType: 'create' | 'update' | 'delete',
    entityId: string,
    data: Record<string, unknown>,
    priority?: number
  ) => Promise<SyncOperationResult>;

  // Draft management
  createDraft: (
    entityType: string,
    entityId: string,
    data: Record<string, unknown>
  ) => Promise<string>;
  updateDraft: (draftId: string, data: Record<string, unknown>) => Promise<void>;
  promoteDraft: (draftId: string) => Promise<SyncOperationResult>;
  deleteDraft: (draftId: string) => Promise<void>;
  getDrafts: () => Map<string, unknown>;

  // Sync control
  forceSyncNow: () => Promise<void>;
  pauseSync: () => void;
  resumeSync: () => void;
  clearOfflineData: () => Promise<void>;

  // Conflict resolution
  resolveConflict: (
    conflictId: string,
    strategy: ResolutionStrategy,
    customData?: Record<string, unknown>
  ) => Promise<void>;
  getConflicts: () => SyncConflict[];
  setConflictPreference: (entityType: string, strategy: ResolutionStrategy) => void;

  // Queue management
  getQueueStats: () => unknown;
  getQueueItems: () => SyncQueueItem[];
  removeQueueItem: (itemId: string) => boolean;
  retryFailedOperations: () => Promise<void>;

  // Network status
  checkConnectivity: () => Promise<boolean>;
  getNetworkQuality: () => NetworkQuality;

  // Storage management
  getStorageInfo: () => Promise<unknown>;
  optimizeStorage: () => Promise<void>;

  // Event handling
  lastError: Error | null;
  clearError: () => void;
}
