/**
 * Offline Manager Type Definitions
 * Phase 6.3: Sync & Offline Systems
 *
 * Interfaces and type definitions for the offline-first architecture,
 * including configuration, state, metrics, and storage estimation.
 */

import type { NetworkQuality } from '../../types/sync-types';

export interface OfflineManagerConfig {
  // Offline detection
  pingUrl: string;
  pingInterval: number;
  pingTimeout: number;
  offlineThreshold: number; // consecutive failed pings to go offline

  // Storage management
  maxOfflineStorage: number; // bytes
  storageWarningThreshold: number; // 0-1, percentage of max storage
  enableStorageCompression: boolean;

  // Sync scheduling
  enableAutoSync: boolean;
  syncInterval: number; // ms, when online
  offlineSyncRetryInterval: number; // ms, when offline
  batchSyncSize: number;

  // Data management
  enableDataPrioritization: boolean;
  criticalDataTypes: string[];
  maxOfflineOperations: number;
  enableDraftMode: boolean;
}

export interface OfflineState {
  isOnline: boolean;
  networkQuality: NetworkQuality;
  lastOnlineTime: Date | null;
  offlineDuration: number; // ms
  pendingSyncOperations: number;
  storageUsed: number; // bytes
  storageAvailable: number; // bytes
  syncInProgress: boolean;
  lastSyncTime: Date | null;
  lastSyncSuccess: boolean;
}

export interface OfflineMetrics {
  totalOfflineTime: number;
  offlineSessionCount: number;
  operationsQueuedOffline: number;
  operationsSyncedOnReconnect: number;
  averageOfflineSessionDuration: number;
  syncSuccessRate: number;
  dataSyncedMB: number;
  conflictsDetected: number;
  conflictsResolved: number;
}

export interface StorageEstimate {
  used: number;
  available: number;
  quota: number;
  percentage: number;
  breakdown: {
    databases: number;
    localStorage: number;
    indexedDB: number;
    webSQL: number;
  };
}
