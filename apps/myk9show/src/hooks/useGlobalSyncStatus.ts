import { useEffect, useState } from 'react';
import type { SyncStatus } from '@/components/sync/SyncStatusIndicator';
import type { SyncMetrics } from '@/types/sync-types';
import { useReplicationSync } from '@/hooks/useReplicationSync';
import { usePendingMutationCount } from '@/hooks/usePendingMutationCount';

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
 * Global sync status derived from REAL replication state:
 * - `status`, `lastSyncAt`, `error` from the ReplicationSyncProvider context
 * - `queueSize` from the actual pending-mutation count (mutationManager)
 * - `isOnline` from navigator + online/offline events
 *
 * Previously this fabricated status with Math.random(), so users saw
 * "synced / just now" while real mutations sat unsynced. Never mock this — a
 * judge relies on it to decide whether their scores are safe (audit C5).
 */
export function useGlobalSyncStatus(): GlobalSyncState {
  const { status: replication } = useReplicationSync();
  const queueSize = usePendingMutationCount();
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Track online/offline.
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const errorCount = Object.values(replication.tablesStatus).filter(s => s === 'error').length;
  const hasError = Boolean(replication.error) || errorCount > 0;

  let status: SyncStatus;
  if (!isOnline) {
    status = 'offline';
  } else if (hasError) {
    status = 'error';
  } else if (replication.isSyncing || queueSize > 0) {
    status = 'pending';
  } else {
    status = 'synced';
  }

  const state: GlobalSyncState = {
    status,
    queueSize,
    isOnline,
    conflictCount: 0,
    errorCount,
  };
  if (replication.lastSyncAt) {
    state.lastSyncAt = replication.lastSyncAt;
  }
  return state;
}
