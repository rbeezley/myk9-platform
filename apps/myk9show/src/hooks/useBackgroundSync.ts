import { useEffect, useState, useCallback } from 'react';
import { backgroundSyncService } from '@/services/sync/backgroundSyncService';
import { SyncMetrics, NetworkState, SyncEvent } from '@/types/sync-types';
import { logger } from '@/services/LoggingService';

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
      
      // Convert to our NetworkState format
      const networkState: NetworkState = {
        isOnline: networkStatus.online,
        quality: networkStatus.quality === 'excellent' ? 'excellent' : 
                 networkStatus.quality === 'good' ? 'good' : 'slow',
        lastChecked: new Date(),
        bandwidth: networkStatus.downlink
      };
      
      setSyncState(prev => ({
        ...prev,
        queueSize: stats.pendingTasks,
        metrics: {
          syncSuccessRate: stats.totalTasks > 0 ? stats.completedTasks / stats.totalTasks : 1,
          averageSyncTime: stats.averageDuration,
          conflictRate: 0, // TODO: Add conflict tracking
          offlineUsageTime: 0, // TODO: Calculate from network monitoring
          queueSize: stats.pendingTasks,
          lastSyncAt: stats.lastSyncAttempt > 0 ? new Date(stats.lastSyncAttempt) : undefined
        },
        lastSyncAt: stats.lastSyncAttempt > 0 ? new Date(stats.lastSyncAttempt) : undefined,
        networkState,
        isOnline: networkState.isOnline
      }));
    } catch (error) {
      logger.error('Failed to update sync state:', 'hooks', {}, error as Error);
    }
  }, []);

  // Handle sync events
  const handleSyncEvent = useCallback((event: SyncEvent) => {
    switch (event.type) {
      case 'sync-started':
        setSyncState(prev => ({ 
          ...prev, 
          isSyncing: true, 
          error: undefined 
        }));
        break;

      case 'sync-completed':
        setSyncState(prev => ({ 
          ...prev, 
          isSyncing: false,
          lastSyncAt: new Date(),
          error: undefined
        }));
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
        // Conflict detected - increment conflict count
        updateSyncState();
        break;

      case 'conflict-resolved':
        // Conflict resolved - update metrics
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
      logger.error('Manual sync failed:', 'hooks', {}, error as Error);
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

  // Get sync status for specific entity
  const getEntitySyncStatus = useCallback((entityType: string, entityId: string): 'synced' | 'pending' | 'error' | 'conflict' => {
    // This would check the sync service for entity-specific status
    // For now, return a simple check based on entity type and ID
    // TODO: Implement proper entity-specific sync status checking
    logger.debug(`Checking sync status for ${entityType}:${entityId}`, 'useBackgroundSync', { entityType, entityId });
    return 'synced';
  }, []);

  // Check if there are pending changes
  const hasPendingChanges = useCallback((): boolean => {
    return syncState.queueSize > 0;
  }, [syncState.queueSize]);

  // Setup effect
  useEffect(() => {
    let mounted = true;

    // Initialize background sync service
    const initializeSync = async () => {
      try {
        // Background sync service initializes automatically
        if (mounted) {
          await updateSyncState();
        }
      } catch (error) {
        logger.error('Failed to initialize sync service:', 'hooks', {}, error as Error);
        if (mounted) {
          setSyncState(prev => ({
            ...prev,
            error: 'Failed to initialize sync service'
          }));
        }
      }
    };

    initializeSync();

    // Set up background sync event listeners
    backgroundSyncService.onSyncComplete((result) => {
      if (mounted) {
        const syncEvent: SyncEvent = {
          type: result.success ? 'sync-completed' : 'sync-failed',
          timestamp: result.timestamp,
          entityType: 'sync-task',
          entityId: result.taskId,
          details: {
            success: result.success,
            attempts: result.attempts,
            duration: result.duration,
            error: result.error
          }
        };
        handleSyncEvent(syncEvent);
      }
    });

    backgroundSyncService.onSyncError((error, task) => {
      if (mounted) {
        const syncEvent: SyncEvent = {
          type: 'sync-failed',
          timestamp: new Date(),
          entityType: task.entity,
          entityId: task.entityId,
          details: { error: error.message }
        };
        handleSyncEvent(syncEvent);
      }
    });

    backgroundSyncService.onNetworkChange((networkStatus) => {
      if (mounted) {
        setSyncState(prev => ({
          ...prev,
          isOnline: networkStatus.online,
          networkState: {
            ...prev.networkState,
            isOnline: networkStatus.online,
            quality: networkStatus.quality === 'excellent' ? 'excellent' : 
                     networkStatus.quality === 'good' ? 'good' : 'slow'
          }
        }));
      }
    });

    // Update state periodically
    const interval = setInterval(() => {
      if (mounted) {
        updateSyncState();
      }
    }, 30000); // Every 30 seconds

    // Network status listeners
    const handleOnline = () => {
      if (mounted) {
        setSyncState(prev => ({ ...prev, isOnline: true }));
        updateSyncState();
      }
    };

    const handleOffline = () => {
      if (mounted) {
        setSyncState(prev => ({ ...prev, isOnline: false }));
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      mounted = false;
      clearInterval(interval);
      
      // Background sync service handles its own cleanup
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
    syncHealthStatus: syncState.metrics.syncSuccessRate > 0.9 ? 'good' : 
                     syncState.metrics.syncSuccessRate > 0.7 ? 'warning' : 'error',
    
    isInitializing: !syncState.lastSyncAt && !syncState.error,
    
    estimatedSyncTime: syncState.queueSize > 0 ? 
                       Math.ceil(syncState.queueSize * (syncState.metrics.averageSyncTime / 1000)) : 0
  };
}