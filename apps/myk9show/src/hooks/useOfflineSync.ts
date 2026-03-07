/**
 * Offline Sync React Hook
 * Phase 6.3: Sync & Offline Systems
 *
 * React hook for managing offline sync functionality, queue operations,
 * conflict resolution, and draft management with automatic state management.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { offlineManager } from '../services/sync/offlineManager';
import { syncQueue } from '../services/sync/SyncQueue';
import { conflictResolver } from '../services/sync/conflictResolver';
import type { ResolutionStrategy, NetworkQuality } from '../types/sync-types';
import type {
  UseOfflineSyncOptions,
  OfflineSyncState,
  SyncOperationResult,
  DraftState,
  ConflictState,
  UseOfflineSyncReturn,
} from './useOfflineSync.types';

// Re-export all types for backwards compatibility
export type {
  UseOfflineSyncOptions,
  OfflineSyncState,
  SyncOperationResult,
  DraftState,
  ConflictState,
  UseOfflineSyncReturn,
} from './useOfflineSync.types';

/**
 * Offline sync hook for managing offline operations and sync state
 */
export const useOfflineSync = (options: UseOfflineSyncOptions = {}): UseOfflineSyncReturn => {
  const {
    autoSync = true,
    enableDrafts = true,
    enableConflictDetection = true,
    syncInterval = 10000,
    // retryOnFailure = true,
    // batchSize = 20,
  } = options;

  // State management
  const [state, setState] = useState<OfflineSyncState>(() => ({
    isOnline: navigator.onLine,
    isOffline: !navigator.onLine,
    isSyncing: false,
    networkQuality: 'good',
    lastSyncTime: null,
    lastSyncSuccess: false,
    pendingOperations: 0,
    storageUsed: 0,
    storageAvailable: 0,
    offlineDuration: 0,
  }));

  const [draftState, setDraftState] = useState<DraftState>(() => ({
    drafts: new Map(),
    activeDrafts: 0,
    lastDraftSaved: null,
  }));

  const [conflictState, setConflictState] = useState<ConflictState>(() => ({
    pendingConflicts: [],
    totalConflicts: 0,
    resolvedConflicts: 0,
    lastConflictDetected: null,
  }));

  const [lastError, setLastError] = useState<Error | null>(null);

  // Refs for cleanup and state tracking
  const eventUnsubscribers = useRef<(() => void)[]>([]);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /** Update state from offline manager */
  const updateState = useCallback(() => {
    const offlineState = offlineManager.getState();
    const conflictMetrics = conflictResolver.getMetrics();

    setState(prev => ({
      ...prev,
      isOnline: offlineState.isOnline,
      isOffline: !offlineState.isOnline,
      isSyncing: offlineState.syncInProgress,
      networkQuality: offlineState.networkQuality,
      lastSyncTime: offlineState.lastSyncTime,
      lastSyncSuccess: offlineState.lastSyncSuccess,
      pendingOperations: offlineState.pendingSyncOperations,
      storageUsed: offlineState.storageUsed,
      storageAvailable: offlineState.storageAvailable,
      offlineDuration: offlineState.offlineDuration,
    }));

    if (enableDrafts) {
      const drafts = offlineManager.getDrafts();
      setDraftState(prev => ({ ...prev, drafts, activeDrafts: drafts.size }));
    }

    if (enableConflictDetection) {
      const pendingConflicts = conflictResolver.getPendingConflicts();
      setConflictState(prev => ({
        ...prev,
        pendingConflicts,
        totalConflicts: conflictMetrics.totalConflicts,
        resolvedConflicts: conflictMetrics.resolvedConflicts,
      }));
    }
  }, [enableDrafts, enableConflictDetection]);

  /** Queue operation for offline processing */
  const queueOperation = useCallback(
    async (
      entityType: 'club' | 'person' | 'dog' | 'show' | 'trial' | 'class' | 'entry' | 'trial_class',
      actionType: 'create' | 'update' | 'delete',
      entityId: string,
      data: Record<string, unknown>,
      priority: number = 5
    ): Promise<SyncOperationResult> => {
      try {
        const operationId = offlineManager.queueOperation(
          entityType,
          actionType,
          entityId,
          data,
          priority
        );
        updateState();
        return { success: true, operationId };
      } catch (error) {
        setLastError(error as Error);
        return { success: false, operationId: '', error: error as Error };
      }
    },
    [updateState]
  );

  /** Create draft operation */
  const createDraft = useCallback(
    async (
      entityType: string,
      entityId: string,
      data: Record<string, unknown>
    ): Promise<string> => {
      if (!enableDrafts) throw new Error('Draft mode is disabled');
      try {
        const draftId = offlineManager.createDraft(entityType, entityId, data);
        setDraftState(prev => ({ ...prev, lastDraftSaved: new Date() }));
        updateState();
        return draftId;
      } catch (error) {
        setLastError(error as Error);
        throw error;
      }
    },
    [enableDrafts, updateState]
  );

  /** Update draft operation */
  const updateDraft = useCallback(
    async (draftId: string, data: Record<string, unknown>): Promise<void> => {
      if (!enableDrafts) throw new Error('Draft mode is disabled');
      try {
        offlineManager.updateDraft(draftId, data);
        setDraftState(prev => ({ ...prev, lastDraftSaved: new Date() }));
        updateState();
      } catch (error) {
        setLastError(error as Error);
        throw error;
      }
    },
    [enableDrafts, updateState]
  );

  /** Promote draft to sync queue */
  const promoteDraft = useCallback(
    async (draftId: string): Promise<SyncOperationResult> => {
      if (!enableDrafts) throw new Error('Draft mode is disabled');
      try {
        const operationId = offlineManager.promoteDraft(draftId);
        updateState();
        return { success: true, operationId };
      } catch (error) {
        setLastError(error as Error);
        return { success: false, operationId: '', error: error as Error };
      }
    },
    [enableDrafts, updateState]
  );

  /** Delete draft operation */
  const deleteDraft = useCallback(
    async (draftId: string): Promise<void> => {
      if (!enableDrafts) throw new Error('Draft mode is disabled');
      try {
        const drafts = offlineManager.getDrafts();
        if (drafts.has(draftId)) {
          drafts.delete(draftId);
          updateState();
        }
      } catch (error) {
        setLastError(error as Error);
        throw error;
      }
    },
    [enableDrafts, updateState]
  );

  const getDrafts = useCallback((): Map<string, unknown> => offlineManager.getDrafts(), []);

  /** Force sync now */
  const forceSyncNow = useCallback(async (): Promise<void> => {
    try {
      setState(prev => ({ ...prev, isSyncing: true }));
      await offlineManager.forceSyncNow();
      updateState();
    } catch (error) {
      setLastError(error as Error);
      setState(prev => ({ ...prev, isSyncing: false }));
      throw error;
    }
  }, [updateState]);

  const pauseSync = useCallback((): void => {
    syncQueue.pause();
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
  }, []);

  const resumeSync = useCallback((): void => {
    syncQueue.resume();
    if (autoSync && !syncIntervalRef.current) {
      syncIntervalRef.current = setInterval(() => {
        if (state.isOnline && state.pendingOperations > 0) {
          forceSyncNow().catch(() => {
            /* Auto-sync failed silently */
          });
        }
      }, syncInterval);
    }
  }, [autoSync, syncInterval, state.isOnline, state.pendingOperations, forceSyncNow]);

  const clearOfflineData = useCallback(async (): Promise<void> => {
    try {
      offlineManager.clearOfflineData();
      conflictResolver.clearConflicts();
      updateState();
    } catch (error) {
      setLastError(error as Error);
      throw error;
    }
  }, [updateState]);

  const resolveConflict = useCallback(
    async (
      conflictId: string,
      strategy: ResolutionStrategy,
      customData?: Record<string, unknown>
    ): Promise<void> => {
      if (!enableConflictDetection) throw new Error('Conflict detection is disabled');
      try {
        await conflictResolver.resolveConflict(conflictId, strategy, customData);
        updateState();
      } catch (error) {
        setLastError(error as Error);
        throw error;
      }
    },
    [enableConflictDetection, updateState]
  );

  const getConflicts = useCallback(() => conflictResolver.getPendingConflicts(), []);
  const setConflictPreference = useCallback((entityType: string, strategy: ResolutionStrategy) => {
    conflictResolver.setUserPreference(entityType, strategy);
  }, []);
  const getQueueStats = useCallback(() => syncQueue.getStats(), []);
  const getQueueItems = useCallback(() => syncQueue.getAll(), []);

  const removeQueueItem = useCallback(
    (itemId: string): boolean => {
      const result = syncQueue.remove(itemId);
      if (result) updateState();
      return result;
    },
    [updateState]
  );

  const retryFailedOperations = useCallback(async (): Promise<void> => {
    try {
      const failedItems = syncQueue.getByStatus('failed');
      failedItems.forEach(item => {
        item.status = 'pending';
        item.retryCount = 0;
        item.scheduledFor = new Date();
      });
      updateState();
      if (state.isOnline) await forceSyncNow();
    } catch (error) {
      setLastError(error as Error);
      throw error;
    }
  }, [updateState, state.isOnline, forceSyncNow]);

  const checkConnectivity = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/health', { method: 'HEAD', cache: 'no-cache' });
      return response.ok;
    } catch {
      return false;
    }
  }, []);

  const getNetworkQuality = useCallback(
    (): NetworkQuality => state.networkQuality,
    [state.networkQuality]
  );

  const getStorageInfo = useCallback(async () => {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      return await navigator.storage.estimate();
    }
    return { usage: state.storageUsed, quota: state.storageUsed + state.storageAvailable };
  }, [state.storageUsed, state.storageAvailable]);

  const optimizeStorage = useCallback(async (): Promise<void> => {
    try {
      const completedItems = syncQueue.getByStatus('completed');
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      completedItems.forEach(item => {
        if (item.processedAt && item.processedAt.getTime() < cutoff) syncQueue.remove(item.id);
      });
      conflictResolver.clearConflicts();
      updateState();
    } catch (error) {
      setLastError(error as Error);
      throw error;
    }
  }, [updateState]);

  const clearError = useCallback((): void => {
    setLastError(null);
  }, []);

  // Setup offline manager event listeners
  useEffect(() => {
    const unsubscribeConnectionRestored = offlineManager.addEventListener(
      'connection-restored',
      () => updateState()
    );
    const unsubscribeConnectionLost = offlineManager.addEventListener('connection-lost', () =>
      updateState()
    );
    const unsubscribeSyncStarted = offlineManager.addEventListener('sync-started', () => {
      setState(prev => ({ ...prev, isSyncing: true }));
    });
    const unsubscribeSyncCompleted = offlineManager.addEventListener('sync-completed', () =>
      updateState()
    );
    const unsubscribeSyncFailed = offlineManager.addEventListener('sync-failed', () => {
      setState(prev => ({ ...prev, isSyncing: false }));
      setLastError(new Error('Sync failed'));
    });
    const unsubscribeConflictDetected = offlineManager.addEventListener('conflict-detected', () => {
      if (enableConflictDetection) {
        setConflictState(prev => ({ ...prev, lastConflictDetected: new Date() }));
        updateState();
      }
    });

    eventUnsubscribers.current = [
      unsubscribeConnectionRestored,
      unsubscribeConnectionLost,
      unsubscribeSyncStarted,
      unsubscribeSyncCompleted,
      unsubscribeSyncFailed,
      unsubscribeConflictDetected,
    ];

    return () => {
      eventUnsubscribers.current.forEach(unsubscribe => unsubscribe());
      eventUnsubscribers.current = [];
    };
  }, [updateState, enableConflictDetection]);

  // Setup auto-sync interval
  useEffect(() => {
    if (autoSync) {
      syncIntervalRef.current = setInterval(() => {
        if (state.isOnline && state.pendingOperations > 0 && !state.isSyncing) {
          forceSyncNow().catch(() => {
            /* Auto-sync failed silently */
          });
        }
      }, syncInterval);

      return () => {
        if (syncIntervalRef.current) {
          clearInterval(syncIntervalRef.current);
          syncIntervalRef.current = null;
        }
      };
    }
    return undefined;
  }, [
    autoSync,
    syncInterval,
    state.isOnline,
    state.pendingOperations,
    state.isSyncing,
    forceSyncNow,
  ]);

  // Initial state update
  useEffect(() => {
    queueMicrotask(() => updateState());
  }, [updateState]);

  // Update state periodically
  useEffect(() => {
    const interval = setInterval(updateState, 5000);
    return () => clearInterval(interval);
  }, [updateState]);

  return {
    state,
    draftState,
    conflictState,
    queueOperation: queueOperation as (
      entityType: string,
      actionType: 'create' | 'update' | 'delete',
      entityId: string,
      data: Record<string, unknown>,
      priority?: number
    ) => Promise<SyncOperationResult>,
    createDraft,
    updateDraft,
    promoteDraft,
    deleteDraft,
    getDrafts,
    forceSyncNow,
    pauseSync,
    resumeSync,
    clearOfflineData,
    resolveConflict,
    getConflicts,
    setConflictPreference,
    getQueueStats,
    getQueueItems,
    removeQueueItem,
    retryFailedOperations,
    checkConnectivity,
    getNetworkQuality,
    getStorageInfo,
    optimizeStorage,
    lastError,
    clearError,
  };
};

export default useOfflineSync;
