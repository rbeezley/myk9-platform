import type { OfflineCheckInServiceConfig } from '@/types/offline-checkin-types';

/** Default configuration for the Offline Check-In Service */
export const DEFAULT_CONFIG: OfflineCheckInServiceConfig = {
  enableQRScanning: true,
  enableBarcodeScanning: true,
  enableManualEntry: true,
  autoResolveConflicts: true,
  conflictResolutionStrategy: 'timestamp',
  maxRetries: 3,
  retryDelay: 1000,
  syncInterval: 30000, // 30 seconds
  validationStrict: true,
  enableTimeSync: true,
  timeSyncInterval: 300000, // 5 minutes
};

/** Storage key for persisted check-in data */
export const STORAGE_KEY = 'offline-checkin-data';
