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
import type { 
  SyncQueueItem,
  SyncConflict,
  ResolutionStrategy,
  NetworkQuality
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

  /**
   * Update state from offline manager
   */
  const updateState = useCallback(() => {
    const offlineState = offlineManager.getState();
    // const metrics = offlineManager.getMetrics();
    // const queueStats = syncQueue.getStats();
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

    // Update draft state
    if (enableDrafts) {
      const drafts = offlineManager.getDrafts();
      setDraftState(prev => ({
        ...prev,
        drafts,
        activeDrafts: drafts.size,
      }));
    }

    // Update conflict state
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

  /**
   * Queue operation for offline processing
   */
  const queueOperation = useCallback(async (
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
      
      return {
        success: true,
        operationId,
      };

    } catch (error) {
      setLastError(error as Error);
      return {
        success: false,
        operationId: '',
        error: error as Error,
      };
    }
  }, [updateState]);

  /**
   * Create draft operation
   */
  const createDraft = useCallback(async (
    entityType: string,
    entityId: string,
    data: Record<string, unknown>
  ): Promise<string> => {
    if (!enableDrafts) {
      throw new Error('Draft mode is disabled');
    }

    try {
      const draftId = offlineManager.createDraft(entityType, entityId, data);
      
      setDraftState(prev => ({
        ...prev,
        lastDraftSaved: new Date(),
      }));
      
      updateState();
      
      console.log(`Draft created: ${draftId}`);
      return draftId;

    } catch (error) {
      setLastError(error as Error);
      throw error;
    }
  }, [enableDrafts, updateState]);

  /**
   * Update draft operation
   */
  const updateDraft = useCallback(async (
    draftId: string,
    data: Record<string, unknown>
  ): Promise<void> => {
    if (!enableDrafts) {
      throw new Error('Draft mode is disabled');
    }

    try {
      offlineManager.updateDraft(draftId, data);
      
      setDraftState(prev => ({
        ...prev,
        lastDraftSaved: new Date(),
      }));
      
      updateState();
      
      console.log(`Draft updated: ${draftId}`);
    } catch (error) {
      setLastError(error as Error);
      throw error;
    }
  }, [enableDrafts, updateState]);

  /**
   * Promote draft to sync queue
   */
  const promoteDraft = useCallback(async (draftId: string): Promise<SyncOperationResult> => {
    if (!enableDrafts) {
      throw new Error('Draft mode is disabled');
    }

    try {
      const operationId = offlineManager.promoteDraft(draftId);
      updateState();
      
      return {
        success: true,
        operationId,
      };

    } catch (error) {
      setLastError(error as Error);
      return {
        success: false,
        operationId: '',
        error: error as Error,
      };
    }
  }, [enableDrafts, updateState]);

  /**
   * Delete draft operation
   */
  const deleteDraft = useCallback(async (draftId: string): Promise<void> => {
    if (!enableDrafts) {
      throw new Error('Draft mode is disabled');
    }

    try {
      const drafts = offlineManager.getDrafts();
      if (drafts.has(draftId)) {
        drafts.delete(draftId);
        updateState();
        console.log(`Draft deleted: ${draftId}`);
      }
    } catch (error) {
      setLastError(error as Error);
      throw error;
    }
  }, [enableDrafts, updateState]);

  /**
   * Get all drafts
   */
  const getDrafts = useCallback((): Map<string, unknown> => {
    return offlineManager.getDrafts();
  }, []);

  /**
   * Force sync now
   */
  const forceSyncNow = useCallback(async (): Promise<void> => {
    try {
      setState(prev => ({ ...prev, isSyncing: true }));
      await offlineManager.forceSyncNow();
      updateState();
      
      console.log('Force sync completed');
    } catch (error) {
      setLastError(error as Error);
      setState(prev => ({ ...prev, isSyncing: false }));
      throw error;
    }
  }, [updateState]);

  /**
   * Pause sync operations
   */
  const pauseSync = useCallback((): void => {
    syncQueue.pause();
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
    console.log('Sync paused');
  }, []);

  /**
   * Resume sync operations
   */
  const resumeSync = useCallback((): void => {
    syncQueue.resume();
    if (autoSync && !syncIntervalRef.current) {
      syncIntervalRef.current = setInterval(() => {
        if (state.isOnline && state.pendingOperations > 0) {
          forceSyncNow().catch(error => {
            console.warn('Auto-sync failed:', error);
          });
        }
      }, syncInterval);
    }
    console.log('Sync resumed');
  }, [autoSync, syncInterval, state.isOnline, state.pendingOperations, forceSyncNow]);

  /**
   * Clear all offline data
   */
  const clearOfflineData = useCallback(async (): Promise<void> => {
    try {
      offlineManager.clearOfflineData();
      conflictResolver.clearConflicts();
      updateState();
      
      console.log('All offline data cleared');
    } catch (error) {
      setLastError(error as Error);
      throw error;
    }
  }, [updateState]);

  /**
   * Resolve conflict with strategy
   */
  const resolveConflict = useCallback(async (
    conflictId: string,
    strategy: ResolutionStrategy,
    customData?: Record<string, unknown>
  ): Promise<void> => {
    if (!enableConflictDetection) {
      throw new Error('Conflict detection is disabled');
    }

    try {
      await conflictResolver.resolveConflict(conflictId, strategy, customData);
      updateState();
      
      console.log(`Conflict resolved: ${conflictId} using ${strategy}`);
    } catch (error) {
      setLastError(error as Error);
      throw error;
    }
  }, [enableConflictDetection, updateState]);

  /**
   * Get all conflicts
   */
  const getConflicts = useCallback((): SyncConflict[] => {
    return conflictResolver.getPendingConflicts();
  }, []);

  /**
   * Set conflict resolution preference
   */
  const setConflictPreference = useCallback((
    entityType: string,
    strategy: ResolutionStrategy
  ): void => {
    conflictResolver.setUserPreference(entityType, strategy);
    console.log(`Conflict preference set: ${entityType} -> ${strategy}`);
  }, []);

  /**
   * Get queue statistics
   */
  const getQueueStats = useCallback(() => {
    return syncQueue.getStats();
  }, []);

  /**
   * Get queue items
   */
  const getQueueItems = useCallback((): SyncQueueItem[] => {
    return syncQueue.getAll();
  }, []);

  /**
   * Remove queue item
   */
  const removeQueueItem = useCallback((itemId: string): boolean => {
    const result = syncQueue.remove(itemId);
    if (result) {
      updateState();
    }
    return result;
  }, [updateState]);

  /**
   * Retry failed operations
   */
  const retryFailedOperations = useCallback(async (): Promise<void> => {
    try {
      const failedItems = syncQueue.getByStatus('failed');
      
      // Reset failed items to pending for retry
      failedItems.forEach(item => {
        item.status = 'pending';
        item.retryCount = 0;
        item.scheduledFor = new Date();
      });

      updateState();
      
      if (state.isOnline) {
        await forceSyncNow();
      }
      
      console.log(`Retrying ${failedItems.length} failed operations`);
    } catch (error) {
      setLastError(error as Error);
      throw error;
    }
  }, [updateState, state.isOnline, forceSyncNow]);

  /**
   * Check network connectivity
   */
  const checkConnectivity = useCallback(async (): Promise<boolean> => {
    // This would typically ping a server endpoint
    try {
      const response = await fetch('/api/health', { 
        method: 'HEAD',
        cache: 'no-cache',
      });
      return response.ok;
    } catch {
      return false;
    }
  }, []);

  /**
   * Get network quality assessment
   */
  const getNetworkQuality = useCallback((): NetworkQuality => {
    return state.networkQuality;
  }, [state.networkQuality]);

  /**
   * Get storage information
   */
  const getStorageInfo = useCallback(async () => {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      return await navigator.storage.estimate();
    }
    return {
      usage: state.storageUsed,
      quota: state.storageUsed + state.storageAvailable,
    };
  }, [state.storageUsed, state.storageAvailable]);

  /**
   * Optimize storage usage
   */
  const optimizeStorage = useCallback(async (): Promise<void> => {
    try {
      // Clear completed items older than 24 hours
      const completedItems = syncQueue.getByStatus('completed');
      const cutoff = Date.now() - (24 * 60 * 60 * 1000);
      
      completedItems.forEach(item => {
        if (item.processedAt && item.processedAt.getTime() < cutoff) {
          syncQueue.remove(item.id);
        }
      });

      // Clear resolved conflicts
      conflictResolver.clearConflicts();
      
      updateState();
      
      console.log('Storage optimization completed');
    } catch (error) {
      setLastError(error as Error);
      throw error;
    }
  }, [updateState]);

  /**
   * Clear last error
   */
  const clearError = useCallback((): void => {
    setLastError(null);
  }, []);

  /**
   * Setup offline manager event listeners
   */
  useEffect(() => {
    const unsubscribeConnectionRestored = offlineManager.addEventListener(
      'connection-restored',
() => {
        console.log('Connection restored event received');
        updateState();
      }
    );

    const unsubscribeConnectionLost = offlineManager.addEventListener(
      'connection-lost',
() => {
        console.log('Connection lost event received');
        updateState();
      }
    );

    const unsubscribeSyncStarted = offlineManager.addEventListener(
      'sync-started',
() => {
        setState(prev => ({ ...prev, isSyncing: true }));
      }
    );

    const unsubscribeSyncCompleted = offlineManager.addEventListener(
      'sync-completed',
() => {
        updateState();
      }
    );

    const unsubscribeSyncFailed = offlineManager.addEventListener(
      'sync-failed',
() => {
        setState(prev => ({ ...prev, isSyncing: false }));
        setLastError(new Error('Sync failed'));
      }
    );

    const unsubscribeConflictDetected = offlineManager.addEventListener(
      'conflict-detected',
() => {
        if (enableConflictDetection) {
          setConflictState(prev => ({
            ...prev,
            lastConflictDetected: new Date(),
          }));
          updateState();
        }
      }
    );

    // Store unsubscribe functions
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

  /**
   * Setup auto-sync interval
   */
  useEffect(() => {
    if (autoSync) {
      syncIntervalRef.current = setInterval(() => {
        if (state.isOnline && state.pendingOperations > 0 && !state.isSyncing) {
          forceSyncNow().catch(error => {
            console.warn('Auto-sync failed:', error);
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
  }, [autoSync, syncInterval, state.isOnline, state.pendingOperations, state.isSyncing, forceSyncNow]);

  /**
   * Initial state update
   */
  useEffect(() => {
    updateState();
  }, [updateState]);

  /**
   * Update state periodically
   */
  useEffect(() => {
    const interval = setInterval(updateState, 5000);
    return () => clearInterval(interval);
  }, [updateState]);

  return {
    // State
    state,
    draftState,
    conflictState,
    
    // Queue operations
    queueOperation: queueOperation as (entityType: string, actionType: "create" | "update" | "delete", entityId: string, data: Record<string, unknown>, priority?: number) => Promise<SyncOperationResult>,
    
    // Draft management
    createDraft,
    updateDraft,
    promoteDraft,
    deleteDraft,
    getDrafts,
    
    // Sync control
    forceSyncNow,
    pauseSync,
    resumeSync,
    clearOfflineData,
    
    // Conflict resolution
    resolveConflict,
    getConflicts,
    setConflictPreference,
    
    // Queue management
    getQueueStats,
    getQueueItems,
    removeQueueItem,
    retryFailedOperations,
    
    // Network status
    checkConnectivity,
    getNetworkQuality,
    
    // Storage management
    getStorageInfo,
    optimizeStorage,
    
    // Error handling
    lastError,
    clearError,
  };
};

export default useOfflineSync;