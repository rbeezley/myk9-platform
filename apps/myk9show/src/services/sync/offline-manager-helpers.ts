/**
 * Offline Manager Helper Functions
 * Phase 6.3: Sync & Offline Systems
 *
 * Pure/stateless helper functions and factory functions used by the
 * OfflineManager class. Extracted for testability and separation of concerns.
 */

import type {
  OfflineManagerConfig,
  OfflineMetrics,
  OfflineState,
  StorageEstimate,
} from './offline-manager-types';

/**
 * Default configuration values for the OfflineManager.
 */
export const DEFAULT_OFFLINE_CONFIG: OfflineManagerConfig = {
  pingUrl: '/api/health',
  pingInterval: 30000, // 30 seconds
  pingTimeout: 5000, // 5 seconds
  offlineThreshold: 3, // 3 failed pings

  maxOfflineStorage: 50 * 1024 * 1024, // 50MB
  storageWarningThreshold: 0.8, // 80%
  enableStorageCompression: true,

  enableAutoSync: true,
  syncInterval: 10000, // 10 seconds when online
  offlineSyncRetryInterval: 60000, // 1 minute when offline
  batchSyncSize: 20,

  enableDataPrioritization: true,
  criticalDataTypes: ['entry', 'checkin', 'score'],
  maxOfflineOperations: 1000,
  enableDraftMode: true,
};

/**
 * Create a fresh OfflineState based on the current browser navigator state.
 */
export function createInitialOfflineState(): OfflineState {
  return {
    isOnline: navigator.onLine,
    networkQuality: 'good',
    lastOnlineTime: navigator.onLine ? new Date() : null,
    offlineDuration: 0,
    pendingSyncOperations: 0,
    storageUsed: 0,
    storageAvailable: 0,
    syncInProgress: false,
    lastSyncTime: null,
    lastSyncSuccess: false,
  };
}

/**
 * Create a fresh OfflineMetrics object with all counters at zero.
 */
export function createInitialOfflineMetrics(): OfflineMetrics {
  return {
    totalOfflineTime: 0,
    offlineSessionCount: 0,
    operationsQueuedOffline: 0,
    operationsSyncedOnReconnect: 0,
    averageOfflineSessionDuration: 0,
    syncSuccessRate: 0,
    dataSyncedMB: 0,
    conflictsDetected: 0,
    conflictsResolved: 0,
  };
}

/**
 * Estimate the total size of data stored in localStorage (in bytes).
 * Returns a rough estimate assuming UTF-16 encoding (2 bytes per character).
 */
export function getLocalStorageSize(): number {
  try {
    let total = 0;
    for (const key in localStorage) {
      if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
        total += localStorage[key].length + key.length;
      }
    }
    return total * 2; // Rough estimate (UTF-16)
  } catch {
    return 0;
  }
}

/**
 * Determine whether an error represents a sync conflict
 * (version mismatch or concurrent modification).
 */
export function isConflictError(error: Error): boolean {
  return (
    error.message.includes('conflict') ||
    error.message.includes('version') ||
    error.message.includes('concurrent')
  );
}

/**
 * Build a StorageEstimate using the browser Storage API when available,
 * falling back to a localStorage-based approximation.
 */
export async function buildStorageEstimate(
  maxOfflineStorage: number
): Promise<StorageEstimate> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();

    return {
      used: estimate.usage || 0,
      available: (estimate.quota || 0) - (estimate.usage || 0),
      quota: estimate.quota || 0,
      percentage: estimate.quota ? (estimate.usage || 0) / estimate.quota : 0,
      breakdown: {
        databases: 0, // Would need more detailed analysis
        localStorage: getLocalStorageSize(),
        indexedDB: 0, // Would need to enumerate databases
        webSQL: 0, // Deprecated
      },
    };
  }

  // Fallback estimation
  const localStorageSize = getLocalStorageSize();
  return {
    used: localStorageSize,
    available: maxOfflineStorage - localStorageSize,
    quota: maxOfflineStorage,
    percentage: localStorageSize / maxOfflineStorage,
    breakdown: {
      databases: 0,
      localStorage: localStorageSize,
      indexedDB: 0,
      webSQL: 0,
    },
  };
}
