/**
 * useDataManagement Hook
 *
 * Manages data export, import, and clear operations with storage tracking.
 * Handles file import/export, storage usage monitoring, and data clearing.
 *
 * Extracted from useSettingsLogic.ts
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { getStorageUsage } from '@/services/dataExportService';
import { logger } from '@/utils/logger';
import {
  exportPersonalDataHelper,
  clearAllDataHelper,
  exportSettingsToFile,
  importSettingsFromFile,
} from '../utils/settingsHelpers';
import { mutationQueue } from '@/services/replication/MutationQueueManager';
import { ensureReplicationManager } from '@/utils/replicationHelper';

/**
 * Storage usage statistics
 */
export interface StorageUsage {
  estimated: number;
  quota: number;
  percentUsed: number;
  localStorageSize: number;
}

/**
 * Hook return type
 */
export interface UseDataManagementReturn {
  // State
  storageUsage: StorageUsage | null;
  isClearing: boolean;
  isRefreshing: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;

  // Actions
  handleExportData: () => Promise<void>;
  handleExportSettings: () => Promise<void>;
  handleImportClick: () => void;
  handleImportFile: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleClearData: (options?: ClearDataOptions) => Promise<void>;
  handleRefreshAllData: () => Promise<void>;
  refreshStorageUsage: () => Promise<void>;
}

/**
 * Options for clearing data
 */
export interface ClearDataOptions {
  keepAuth?: boolean;
  keepSettings?: boolean;
  keepFavorites?: boolean;
}

/**
 * Custom hook for managing data operations
 *
 * Provides methods for:
 * - **Export Data**: Export personal data (favorites, settings, etc.) as JSON
 * - **Export Settings**: Export settings configuration as JSON
 * - **Import Settings**: Import settings from JSON file
 * - **Clear Data**: Clear all personal data with options to preserve auth/settings
 * - **Storage Tracking**: Monitor storage usage (localStorage + IndexedDB)
 *
 * **Storage Usage**: Automatically loads on mount and refreshes after clear operations
 * **File Import**: Uses hidden file input with ref for programmatic triggering
 * **Error Handling**: All operations handle errors gracefully with toast messages
 *
 * @param showToastMessage - Callback to display toast notifications
 * @returns Data management state and control methods
 *
 * @example
 * ```tsx
 * function Settings() {
 *   const showToast = (msg: string, type: 'success' | 'error') => {
 *     logger.log(`[${type}] ${msg}`);
 *   };
 *
 *   const {
 *     storageUsage,
 *     handleExportData,
 *     handleClearData,
 *     fileInputRef
 *   } = useDataManagement(showToast);
 *
 *   return (
 *     <div>
 *       <p>Storage: {storageUsage?.percentUsed}% used</p>
 *       <button onClick={handleExportData}>Export Data</button>
 *       <button onClick={() => handleClearData({ keepAuth: true })}>
 *         Clear Data
 *       </button>
 *       <input
 *         ref={fileInputRef}
 *         type="file"
 *         accept=".json"
 *         style={{ display: 'none' }}
 *         onChange={handleImportFile}
 *       />
 *     </div>
 *   );
 * }
 * ```
 */
export function useDataManagement(
  showToastMessage: (message: string, type?: 'success' | 'error' | 'info') => void
): UseDataManagementReturn {
  const { exportSettings, importSettings } = useSettingsStore();

  // State
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Load storage usage on mount
   */
  useEffect(() => {
    refreshStorageUsage();
  }, []);

  /**
   * Refresh storage usage statistics
   */
  const refreshStorageUsage = useCallback(async () => {
    try {
      const usage = await getStorageUsage();
      setStorageUsage(usage);
    } catch (err) {
      logger.error('Error getting storage usage:', err);
    }
  }, []);

  /**
   * Export personal data (favorites, settings, scroll positions, etc.)
   */
  const handleExportData = useCallback(async () => {
    try {
      await exportPersonalDataHelper(showToastMessage);
    } catch (err) {
      logger.error('Error exporting data:', err);
      showToastMessage('Failed to export data', 'error');
    }
  }, [showToastMessage]);

  /**
   * Export settings configuration only
   */
  const handleExportSettings = useCallback(async () => {
    try {
      await exportSettingsToFile(exportSettings, showToastMessage);
    } catch (err) {
      logger.error('Error exporting settings:', err);
      showToastMessage('Failed to export settings', 'error');
    }
  }, [exportSettings, showToastMessage]);

  /**
   * Trigger file input click programmatically
   */
  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /**
   * Import settings from JSON file
   */
  const handleImportFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      await importSettingsFromFile(file, importSettings, showToastMessage, fileInputRef);
    } catch (err) {
      logger.error('Error importing settings:', err);
      showToastMessage('Failed to import settings', 'error');
    }
  }, [importSettings, showToastMessage]);

  /**
   * Clear all personal data with optional preservation
   */
  const handleClearData = useCallback(async (options: ClearDataOptions = {}) => {
    setIsClearing(true);
    try {
      const usage = await clearAllDataHelper(showToastMessage, {
        keepAuth: options.keepAuth ?? true,
        keepSettings: options.keepSettings ?? false,
        keepFavorites: options.keepFavorites ?? false,
      });
      setStorageUsage(usage);
    } catch (err) {
      logger.error('Error clearing data:', err);
      showToastMessage('Failed to clear data', 'error');
    } finally {
      setIsClearing(false);
    }
  }, [showToastMessage]);

  /**
   * Refresh all data - syncs pending changes, clears cache, and reloads
   * Safe for offline scoring: syncs pending mutations before clearing
   */
  const handleRefreshAllData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Check for pending mutations
      const pendingMutations = await mutationQueue.getPending();
      const hasPending = pendingMutations.length > 0;
      const isOnline = navigator.onLine;

      if (hasPending) {
        if (!isOnline) {
          showToastMessage(
            `Cannot refresh: ${pendingMutations.length} unsynced score(s). Please connect to internet first.`,
            'error'
          );
          setIsRefreshing(false);
          return;
        }

        // Try to sync pending mutations first
        showToastMessage('Syncing pending changes...', 'info');
        try {
          const manager = await ensureReplicationManager();
          await manager.syncAll({ forceFullSync: false });

          // Check again after sync
          const stillPending = await mutationQueue.getPending();
          if (stillPending.length > 0) {
            showToastMessage(
              `Warning: ${stillPending.length} change(s) could not be synced. They will be preserved.`,
              'error'
            );
            // Don't clear - preserve the mutations
            setIsRefreshing(false);
            return;
          }
        } catch (syncError) {
          logger.error('Error syncing before refresh:', syncError);
          showToastMessage('Sync failed. Please try again when online.', 'error');
          setIsRefreshing(false);
          return;
        }
      }

      // All clear - delete the IndexedDB database and reload
      showToastMessage('Clearing cache and reloading...', 'info');

      // Clear IndexedDB databases
      const dbNames = ['myK9Q_Replication', 'myK9Q-replication'];
      for (const dbName of dbNames) {
        try {
          const deleteRequest = indexedDB.deleteDatabase(dbName);
          await new Promise<void>((resolve, reject) => {
            deleteRequest.onsuccess = () => resolve();
            deleteRequest.onerror = () => reject(deleteRequest.error);
            deleteRequest.onblocked = () => {
              logger.warn(`[RefreshAllData] Database ${dbName} delete blocked`);
              resolve(); // Continue anyway
            };
          });
          logger.log(`[RefreshAllData] Deleted IndexedDB: ${dbName}`);
        } catch (err) {
          logger.warn(`[RefreshAllData] Could not delete ${dbName}:`, err);
        }
      }

      // Short delay to ensure DB is cleared, then reload
      setTimeout(() => {
        window.location.reload();
      }, 500);

    } catch (err) {
      logger.error('Error refreshing data:', err);
      showToastMessage('Failed to refresh data', 'error');
      setIsRefreshing(false);
    }
  }, [showToastMessage]);

  return {
    // State
    storageUsage,
    isClearing,
    isRefreshing,
    fileInputRef,

    // Actions
    handleExportData,
    handleExportSettings,
    handleImportClick,
    handleImportFile,
    handleClearData,
    handleRefreshAllData,
    refreshStorageUsage,
  };
}
