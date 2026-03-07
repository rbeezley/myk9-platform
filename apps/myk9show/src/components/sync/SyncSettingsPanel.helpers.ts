import type { ExtendedSyncSettings } from './SyncSettingsPanel.types';

export const DEFAULT_SYNC_SETTINGS: ExtendedSyncSettings = {
  autoSync: {
    enabled: true,
    interval: 15,
    onlyOnWifi: false,
    batteryOptimization: true,
  },
  conflicts: {
    strategy: 'manual',
    autoResolveSimple: true,
    showResolutionNotifications: true,
  },
  performance: {
    batchSize: 50,
    maxConcurrentOperations: 3,
    retryAttempts: 3,
    timeoutDuration: 30,
    compressionEnabled: true,
  },
  network: {
    allowCellular: true,
    maxCellularUsage: 100,
    lowBandwidthMode: false,
    prefetchData: true,
  },
  notifications: {
    syncComplete: false,
    syncErrors: true,
    conflictsDetected: true,
    offlineMode: true,
    queueBacklog: true,
  },
  advanced: {
    enableDebugLogging: false,
    keepSyncHistory: true,
    historyRetentionDays: 30,
    enableMetrics: true,
    backgroundSync: true,
  },
};

export function getConflictStrategyDescription(strategy: string): string {
  switch (strategy) {
    case 'manual':
      return 'Always prompt user to resolve conflicts';
    case 'latest-wins':
      return 'Automatically use the most recent version';
    case 'merge':
      return 'Attempt to merge changes automatically';
    case 'ask-always':
      return 'Ask for strategy on each conflict';
    default:
      return '';
  }
}

/**
 * Convert ExtendedSyncSettings to the basic settings shape used by the sync store.
 */
export function toBasicSyncSettings(settings: ExtendedSyncSettings): {
  autoSync: boolean;
  syncInterval: number;
  batchSize: number;
  retryAttempts: number;
} {
  return {
    autoSync: settings.autoSync.enabled,
    syncInterval: settings.autoSync.interval * 60000, // Convert to ms
    batchSize: settings.performance.batchSize,
    retryAttempts: settings.performance.retryAttempts,
  };
}
