/**
 * Shared fixtures and store reset helper for offline queue tests.
 */

import { useOfflineQueueStore } from '../offlineQueueStore';

export const baseScore = {
  entryId: 101,
  armband: 1,
  classId: 10,
  className: 'Novice A',
  licenseKey: 'test-license',
  scoreData: { resultText: 'Q' },
};

export const resetOfflineQueueStore = () => {
  useOfflineQueueStore.setState({
    queue: [],
    failedItems: [],
    isOnline: true,
    isSyncing: false,
    lastSyncAttempt: null,
  });
};
