import { useState, useEffect, useMemo } from 'react';
import { useOfflineScoringStore } from './offlineScoringStore';

/**
 * Derives sync status from the store's sync queue and the browser's
 * online/offline state.
 *
 * Listens to `window` online/offline events so the UI updates
 * reactively when connectivity changes.
 */
export function useSyncStatus() {
  const syncQueue = useOfflineScoringStore(state => state.syncQueue);
  const setOfflineMode = useOfflineScoringStore(state => state.setOfflineMode);

  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      setOfflineMode(false);
    };
    const goOffline = () => {
      setIsOnline(false);
      setOfflineMode(true);
    };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [setOfflineMode]);

  return useMemo(() => {
    const pendingCount = syncQueue.filter(i => i.status === 'pending').length;
    const processingCount = syncQueue.filter(i => i.status === 'processing').length;
    const failedCount = syncQueue.filter(i => i.status === 'failed').length;

    const lastCompleted = syncQueue
      .filter(i => i.status === 'completed')
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

    return {
      isOnline,
      pendingCount,
      processingCount,
      failedCount,
      lastSyncTime: lastCompleted ? new Date(lastCompleted.timestamp) : null,
    };
  }, [syncQueue, isOnline]);
}
