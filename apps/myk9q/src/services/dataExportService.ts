/**
 * Data Export Service
 *
 * Provides functionality to export and delete user's personal data
 * in compliance with privacy regulations (GDPR, CCPA, etc.)
 */

import { useSettingsStore, type AppSettings } from '@/stores/settingsStore';
import { logger } from '@/utils/logger';

export interface ExportedData {
  metadata: {
    exportDate: string;
    appVersion: string;
    licenseKey?: string;
  };
  settings: Partial<AppSettings>;
  favorites: Record<string, string[]>;
  auth: {
    role?: string;
    lastLogin?: string;
  };
  scrollPositions: Record<string, number>;
  dismissedPrompts: Record<string, unknown>;
  customData: Record<string, unknown>;
}

/**
 * Collect all user data from localStorage and IndexedDB
 */
async function collectUserData(licenseKey?: string): Promise<ExportedData> {
  const data: ExportedData = {
    metadata: {
      exportDate: new Date().toISOString(),
      appVersion: '1.0.0',
      licenseKey,
    },
    settings: {},
    favorites: {},
    auth: {},
    scrollPositions: {},
    dismissedPrompts: {},
    customData: {},
  };

  // Get settings
  try {
    const settingsStore = useSettingsStore.getState();
    data.settings = settingsStore.settings;
  } catch (error) {
    logger.error('Failed to export settings:', error);
  }

  // Collect data from localStorage
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;

    try {
      const value = localStorage.getItem(key);
      if (!value) continue;

      // Settings (already collected above, skip to avoid duplication)
      if (key === 'myK9Q_settings') {
        continue;
      }

      // Auth data
      if (key === 'myK9Q_auth') {
        const authData = JSON.parse(value);
        data.auth = {
          role: authData.role,
          lastLogin: authData.lastLogin,
          // Don't export sensitive data like passcodes
        };
        continue;
      }

      // Favorites (all license keys)
      if (key.startsWith('dog_favorites_')) {
        const favLicenseKey = key.replace('dog_favorites_', '');
        data.favorites[favLicenseKey] = JSON.parse(value);
        continue;
      }

      // Scroll positions
      if (key.startsWith('scroll_')) {
        const position = parseFloat(value);
        data.scrollPositions[key] = position;
        continue;
      }

      // Dismissed prompts (install prompts, etc.)
      if (key.startsWith('pwa_install_dismissed') || key.startsWith('dismissed_')) {
        try {
          data.dismissedPrompts[key] = JSON.parse(value);
        } catch {
          data.dismissedPrompts[key] = value;
        }
        continue;
      }

      // Any other custom data
      if (key.startsWith('myK9Q_')) {
        try {
          data.customData[key] = JSON.parse(value);
        } catch {
          data.customData[key] = value;
        }
      }
    } catch (error) {
      logger.error(`Failed to export localStorage key: ${key}`, error);
    }
  }

  // Note: IndexedDB is intentionally not exported - it contains cached server data
  // (replicated trial/class/entry data), not user-generated content.
  // User's personal data (settings, favorites, preferences) is stored in localStorage above.

  return data;
}

/**
 * Export user data as downloadable JSON file
 */
export async function exportPersonalData(licenseKey?: string): Promise<void> {
  try {
    logger.info('Starting data export...');

    const data = await collectUserData(licenseKey);

    // Create blob and download
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `myK9Q-data-export-${timestamp}.json`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);

    logger.info('Data export completed successfully');
  } catch (error) {
    logger.error('Failed to export data:', error);
    throw new Error('Failed to export your data. Please try again.');
  }
}

/**
 * Clear all myK9Q IndexedDB databases
 * Extracted to reduce nesting depth (DEBT-009)
 */
async function clearMyK9QIndexedDBDatabases(): Promise<void> {
  try {
    // Get all database names (not supported in all browsers)
    const databases = await window.indexedDB.databases?.();
    if (!databases) return;

    for (const db of databases) {
      if (!db.name || !db.name.startsWith('myK9Q')) continue;
      window.indexedDB.deleteDatabase(db.name);
      logger.info(`Deleted IndexedDB: ${db.name}`);
    }
  } catch (error) {
    logger.warn('Could not enumerate IndexedDB databases:', error);
  }
}

/**
 * Clear all user data except authentication
 * (Allows user to continue using app but resets preferences)
 */
export async function clearAllData(options: {
  keepAuth?: boolean;
  keepSettings?: boolean;
  keepFavorites?: boolean;
} = {}): Promise<void> {
  try {
    logger.info('Starting data cleanup...', options);

    const keysToPreserve: string[] = [];

    // Optionally preserve auth
    if (options.keepAuth) {
      keysToPreserve.push('myK9Q_auth');
    }

    // Optionally preserve settings
    if (options.keepSettings) {
      keysToPreserve.push('myK9Q_settings');
    }

    // Collect all localStorage keys
    const allKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) allKeys.push(key);
    }

    // Delete keys not in preserve list
    for (const key of allKeys) {
      if (keysToPreserve.includes(key)) {
        continue;
      }

      // Optionally preserve favorites
      if (options.keepFavorites && key.startsWith('dog_favorites_')) {
        continue;
      }

      localStorage.removeItem(key);
    }

    // Clear IndexedDB if it exists
    if (window.indexedDB) {
      await clearMyK9QIndexedDBDatabases();
    }

    // Clear sessionStorage
    sessionStorage.clear();

    logger.info('Data cleanup completed successfully');
  } catch (error) {
    logger.error('Failed to clear data:', error);
    throw new Error('Failed to clear your data. Please try again.');
  }
}

/**
 * Get estimated storage usage
 */
export async function getStorageUsage(): Promise<{
  estimated: number;
  quota: number;
  percentUsed: number;
  localStorageSize: number;
}> {
  let localStorageSize = 0;

  // Calculate localStorage size
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const value = localStorage.getItem(key);
      if (value) {
        localStorageSize += key.length + value.length;
      }
    }
  }

  // Get storage estimate (if supported)
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percentUsed = quota > 0 ? (usage / quota) * 100 : 0;

      return {
        estimated: usage,
        quota,
        percentUsed,
        localStorageSize: localStorageSize * 2, // UTF-16 characters are 2 bytes
      };
    } catch (error) {
      logger.warn('Failed to get storage estimate:', error);
    }
  }

  return {
    estimated: localStorageSize * 2,
    quota: 0,
    percentUsed: 0,
    localStorageSize: localStorageSize * 2,
  };
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
