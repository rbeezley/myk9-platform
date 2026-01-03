import { useEffect, useState } from 'react';
import type { SyncStatus } from '@/components/sync/SyncStatusIndicator';
import type { SyncMetrics } from '@/types/sync-types';

interface GlobalSyncState {
  status: SyncStatus;
  lastSyncAt?: Date;
  queueSize: number;
  isOnline: boolean;
  conflictCount: number;
  errorCount: number;
  metrics?: SyncMetrics;
}

/**
 * Hook to provide global sync status across the application
 * This would integrate with the actual sync service in production
 */
export function useGlobalSyncStatus(): GlobalSyncState {
  const [syncState, setSyncState] = useState<GlobalSyncState>({
    status: 'synced',
    lastSyncAt: new Date(),
    queueSize: 0,
    isOnline: true,
    conflictCount: 0,
    errorCount: 0
  });

  useEffect(() => {
    // Simulate network status monitoring
    const handleOnline = () => {
      setSyncState(prev => ({ ...prev, isOnline: true, status: 'synced' }));
    };

    const handleOffline = () => {
      setSyncState(prev => ({ ...prev, isOnline: false, status: 'offline' }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Simulate periodic sync status updates
    const interval = setInterval(() => {
      const now = new Date();
      const isOnline = navigator.onLine;
      
      // Mock some sync activity
      const mockStatus: SyncStatus = isOnline ? 
        (Math.random() > 0.9 ? 'pending' : 'synced') : 
        'offline';

      setSyncState(prev => ({
        ...prev,
        status: mockStatus,
        lastSyncAt: mockStatus === 'synced' ? now : prev.lastSyncAt,
        isOnline,
        queueSize: mockStatus === 'pending' ? Math.floor(Math.random() * 5) : 0
      }));
    }, 10000); // Update every 10 seconds

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  return syncState;
}

/**
 * Hook to get sync status for a specific entity
 */
export function useEntitySyncStatus(
  entityType: string, 
  entityId: string
): { 
  status: SyncStatus; 
  lastSyncAt?: Date; 
  errorMessage?: string;
  onRetry?: () => void;
} {
  const [entityStatus, setEntityStatus] = useState<{
    status: SyncStatus;
    lastSyncAt?: Date;
    errorMessage?: string;
  }>({
    status: 'synced',
    lastSyncAt: new Date()
  });

  useEffect(() => {
    // In production, this would check the sync status for the specific entity
    // For now, we'll simulate some entity-specific sync behavior
    
    const checkEntityStatus = () => {
      // Mock some occasional sync issues
      const weights = [0.8, 0.15, 0.05]; // Most entities are synced
      
      const random = Math.random();
      let status: SyncStatus = 'synced';
      
      if (random < weights[2]) {
        status = 'error';
      } else if (random < weights[1] + weights[2]) {
        status = 'pending';
      }

      setEntityStatus({
        status,
        lastSyncAt: status === 'synced' ? new Date() : undefined,
        errorMessage: status === 'error' ? 'Failed to sync changes' : undefined
      });
    };

    // Check immediately and then periodically
    checkEntityStatus();
    const interval = setInterval(checkEntityStatus, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [entityType, entityId]);

  const handleRetry = () => {
    // Simulate retry logic
    setEntityStatus(prev => ({ ...prev, status: 'pending' }));
    
    setTimeout(() => {
      setEntityStatus({
        status: 'synced',
        lastSyncAt: new Date()
      });
    }, 2000);
  };

  return {
    ...entityStatus,
    onRetry: entityStatus.status === 'error' ? handleRetry : undefined
  };
}