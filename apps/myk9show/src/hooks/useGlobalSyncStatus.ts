import { useEffect, useState } from 'react';
import type { SyncMetrics } from '@/types/sync-types';
import { useReplicationSync } from '@/hooks/useReplicationSync';
import { useUnsentWork } from '@/hooks/useUnsentWork';

export type SyncStatus = 'synced' | 'pending' | 'error' | 'conflict' | 'offline';

interface GlobalSyncState {
  status: SyncStatus;
  lastSyncAt?: Date;
  /** Unsent work, waiting or refused: scores plus other changed rows (MYK9-2011). */
  queueSize: number;
  /** Dogs whose score has not reached the server. */
  unsentScoreCount: number;
  /** Changed rows other than scores. */
  otherChangeCount: number;
  /** Refused work that will not send on its own and needs a person. */
  refusedCount: number;
  isOnline: boolean;
  conflictCount: number;
  errorCount: number;
  metrics?: SyncMetrics;
}

/**
 * Global sync status derived from REAL replication state:
 * - `status`, `lastSyncAt`, `error` from the ReplicationSyncProvider context
 * - `queueSize` from the device's unsent work, waiting and refused (useUnsentWork)
 * - `isOnline` from navigator + online/offline events
 *
 * Previously this fabricated status with Math.random(), so users saw
 * "synced / just now" while real mutations sat unsynced. Never mock this — a
 * judge relies on it to decide whether their scores are safe (audit C5).
 */
export function useGlobalSyncStatus(): GlobalSyncState {
  const { status: replication } = useReplicationSync();
  const unsent = useUnsentWork();
  const queueSize = unsent.total;
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
    unsentScoreCount: unsent.scores.length,
    otherChangeCount: unsent.otherChangeCount,
    refusedCount: unsent.refusedCount,
    isOnline,
    conflictCount: 0,
    errorCount,
  };
  if (replication.lastSyncAt) {
    state.lastSyncAt = replication.lastSyncAt;
  }
  return state;
}
