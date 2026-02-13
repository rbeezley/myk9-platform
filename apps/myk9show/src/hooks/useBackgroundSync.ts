import { useEffect, useState, useCallback } from 'react';
import { backgroundSyncService } from '@/services/sync/backgroundSyncService';
import { SyncMetrics, NetworkState, SyncEvent } from '@/types/sync-types';
import { logger } from '@/services/LoggingService';
import { ensureError } from '@myk9/core';
import {
  buildNetworkState,
  mapNetworkQuality,
  calculateSyncMetrics,
  createSyncCompletionEvent,
  createSyncErrorEvent,
  calculateSyncHealthStatus,
} from '@/hooks/backgroundSyncHelpers';

export interface BackgroundSyncState {
  isOnline: boolean;
  isSyncing: boolean;
  queueSize: number;
  lastSyncAt?: Date | undefined;
  syncProgress?: {
    completed: number;
    total: number;
    currentEntity?: string | undefined;
  } | undefined;
  error?: string | undefined;
  metrics: SyncMetrics;
  networkState: NetworkState;
}

export function useBackgroundSync() {
  const [syncState, setSyncState] = useState<BackgroundSyncState>({
    isOnline: navigator.onLine,
    isSyncing: false,
    queueSize: 0,
    metrics: {
      syncSuccessRate: 0,
      averageSyncTime: 0,
      conflictRate: 0,
      offlineUsageTime: 0,
      queueSize: 0
    },
    networkState: {
      isOnline: navigator.onLine,
      quality: 'good',
      lastChecked: new Date()
    }
  });

  // Update sync state from service
  const updateSyncState = useCallback(async () => {
    try {
      const stats = backgroundSyncService.getSyncStatistics();
      const networkStatus = backgroundSyncService.getNetworkStatus();
      const networkState = buildNetworkState(networkStatus.online, networkStatus.quality, networkStatus.downlink);
      const metricsWithDate = calculateSyncMetrics(stats);

      setSyncState(prev => ({
        ...prev,
        queueSize: stats.pendingTasks,
        metrics: metricsWithDate,
        lastSyncAt: metricsWithDate.lastSyncAt,
        networkState,
        isOnline: networkState.isOnline
      }));
    } catch (error) {
      logger.error('Failed to update sync state:', 'hooks', {}, ensureError(error));
    }
  }, []);

  // Handle sync events
  const handleSyncEvent = useCallback((event: SyncEvent) => {
    switch (event.type) {
      case 'sync-started':
        setSyncState(prev => ({ ...prev, isSyncing: true, error: undefined }));
        break;

      case 'sync-completed':
        setSyncState(prev => ({ ...prev, isSyncing: false, lastSyncAt: new Date(), error: undefined }));
        updateSyncState();
        break;

      case 'sync-failed':
        setSyncState(prev => ({
          ...prev,
          isSyncing: false,
          error: (event.details?.error as string) || 'Sync failed'
        }));
        updateSyncState();
        break;

      case 'conflict-detected':
      case 'conflict-resolved':
        updateSyncState();
        break;
    }
  }, [updateSyncState]);

  // Force sync now
  const forceSyncNow = useCallback(async () => {
    try {
      setSyncState(prev => ({ ...prev, isSyncing: true, error: undefined }));
      await backgroundSyncService.forcSync();
      setTimeout(updateSyncState, 100);
    } catch (error) {
      logger.error('Manual sync failed:', 'hooks', {}, ensureError(error));
      setSyncState(prev => ({
        ...prev,
        isSyncing: false,
        error: error instanceof Error ? error.message : 'Manual sync failed'
      }));
    }
  }, [updateSyncState]);

  // Clear sync errors
  const clearError = useCallback(() => {
    setSyncState(prev => ({ ...prev, error: undefined }));
  }, []);

  const getEntitySyncStatus = useCallback((entityType: string, entityId: string): 'synced' | 'pending' | 'error' | 'conflict' => {
    const pendingTasks = backgroundSyncService.getPendingSyncTasks();
    const entityTasks = pendingTasks.filter(
      task => task.entity === entityType && task.entityId === entityId
    );

    if (entityTasks.length === 0) {
      return 'synced';
    }

    const results = backgroundSyncService.getSyncResults();
    const entityResults = results.filter(r => {
      const matchingTask = entityTasks.find(t => t.id === r.taskId);
      return !!matchingTask;
    });

    const hasConflict = entityResults.some(
      r => !r.success && r.error?.startsWith('CONFLICT:')
    );
    if (hasConflict) {
      return 'conflict';
    }

    const hasError = entityResults.some(r => !r.success);
    if (hasError) {
      return 'error';
    }

    return 'pending';
  }, []);

  // Check if there are pending changes
  const hasPendingChanges = useCallback((): boolean => {
    return syncState.queueSize > 0;
  }, [syncState.queueSize]);

  // Setup effect
  useEffect(() => {
    let mounted = true;

    const initializeSync = async () => {
      try {
        if (mounted) await updateSyncState();
      } catch (error) {
        logger.error('Failed to initialize sync service:', 'hooks', {}, ensureError(error));
        if (mounted) {
          setSyncState(prev => ({ ...prev, error: 'Failed to initialize sync service' }));
        }
      }
    };

    initializeSync();

    // Sync event listeners
    backgroundSyncService.onSyncComplete((result) => {
      if (mounted) handleSyncEvent(createSyncCompletionEvent(result));
    });

    backgroundSyncService.onSyncError((error, task) => {
      if (mounted) handleSyncEvent(createSyncErrorEvent(error, task));
    });

    backgroundSyncService.onNetworkChange((networkStatus) => {
      if (mounted) {
        setSyncState(prev => ({
          ...prev,
          isOnline: networkStatus.online,
          networkState: {
            ...prev.networkState,
            isOnline: networkStatus.online,
            quality: mapNetworkQuality(networkStatus.quality),
          }
        }));
      }
    });

    // Periodic state refresh
    const interval = setInterval(() => {
      if (mounted) updateSyncState();
    }, 30000);

    // Network status listeners
    const handleOnline = () => {
      if (!mounted) return;
      setSyncState(prev => ({ ...prev, isOnline: true }));
      updateSyncState();
    };

    const handleOffline = () => {
      if (!mounted) return;
      setSyncState(prev => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleSyncEvent, updateSyncState]);

  return {
    // State
    ...syncState,

    // Actions
    forceSyncNow,
    clearError,
    getEntitySyncStatus,
    hasPendingChanges,

    // Computed values
    syncHealthStatus: calculateSyncHealthStatus(syncState.metrics.syncSuccessRate),
    isInitializing: !syncState.lastSyncAt && !syncState.error,
    estimatedSyncTime: syncState.queueSize > 0 ?
                       Math.ceil(syncState.queueSize * (syncState.metrics.averageSyncTime / 1000)) : 0
  };
}
