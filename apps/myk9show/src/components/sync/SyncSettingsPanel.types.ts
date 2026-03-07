export interface ExtendedSyncSettings {
  // Auto-sync configuration
  autoSync: {
    enabled: boolean;
    interval: number; // minutes
    onlyOnWifi: boolean;
    batteryOptimization: boolean;
  };

  // Conflict resolution
  conflicts: {
    strategy: 'manual' | 'latest-wins' | 'merge' | 'ask-always';
    autoResolveSimple: boolean;
    showResolutionNotifications: boolean;
  };

  // Performance settings
  performance: {
    batchSize: number;
    maxConcurrentOperations: number;
    retryAttempts: number;
    timeoutDuration: number; // seconds
    compressionEnabled: boolean;
  };

  // Network preferences
  network: {
    allowCellular: boolean;
    maxCellularUsage: number; // MB per day
    lowBandwidthMode: boolean;
    prefetchData: boolean;
  };

  // Notifications
  notifications: {
    syncComplete: boolean;
    syncErrors: boolean;
    conflictsDetected: boolean;
    offlineMode: boolean;
    queueBacklog: boolean;
  };

  // Advanced options
  advanced: {
    enableDebugLogging: boolean;
    keepSyncHistory: boolean;
    historyRetentionDays: number;
    enableMetrics: boolean;
    backgroundSync: boolean;
  };
}

export interface SyncSettingsPanelProps {
  className?: string;
  onSettingsChange?: (settings: ExtendedSyncSettings) => void;
}
