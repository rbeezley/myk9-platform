/**
 * Centralized Storage Keys
 *
 * All localStorage and sessionStorage keys used in the application.
 * Using constants prevents typos and makes it easy to audit storage usage.
 */

export const STORAGE_KEYS = {
  // ==========================================================================
  // User Preferences
  // ==========================================================================

  /** Theme mode: 'light' | 'dark' | 'system' */
  THEME_MODE: 'theme-mode',

  /** Legacy theme key (deprecated, use THEME_MODE) */
  THEME_LEGACY: 'theme',

  /** Audio settings for scoring interface */
  AUDIO_SETTINGS: 'k9show-audio-settings',

  /** Push notification preferences */
  NOTIFICATION_PREFERENCES: 'notificationPreferences',

  // ==========================================================================
  // Development / Debug
  // ==========================================================================

  /** Current mock user for development testing */
  DEV_MOCK_USER: 'dev-current-mock-user',

  /** Manual error logs for debugging */
  MANUAL_ERROR_LOGS: 'manualErrorLogs',

  /** Search analytics for debugging */
  SEARCH_ANALYTICS: 'searchAnalytics',

  // ==========================================================================
  // Offline / Sync
  // ==========================================================================

  /** Prefix for offline operations queue */
  OFFLINE_QUEUE_PREFIX: 'myk9show-offline-queue',

  /** Error monitoring storage */
  ERROR_MONITORING: 'myk9show-error-monitoring',

  // ==========================================================================
  // Drafts
  // ==========================================================================

  /** Prefix for draft entries - append entity type and ID */
  DRAFT_PREFIX: 'draft-',

  /** Draft metadata storage - append entity type */
  DRAFT_METADATA_PREFIX: 'draft-metadata-',

  // ==========================================================================
  // Saved Views
  // ==========================================================================

  /** Prefix for saved view configurations - append page key */
  SAVED_VIEWS_PREFIX: 'myk9:saved-views',

  // ==========================================================================
  // Search / Caching
  // ==========================================================================

  /** Prefix for recent searches - append search category */
  RECENT_SEARCHES_PREFIX: 'recent-searches-',

  // ==========================================================================
  // Mobile Performance (from MobilePerformanceOptimizer)
  // ==========================================================================

  /** Mobile performance cache database */
  MOBILE_CACHE_DB: 'MobilePerformanceCache',

  /** Mobile localStorage cache prefix */
  MOBILE_CACHE_PREFIX: 'mobile_',

  // ==========================================================================
  // Logging Service
  // ==========================================================================

  /** Persistent log storage */
  LOGS: 'myk9show_logs',

  // ==========================================================================
  // Security (Handled by SecureStorage, not direct localStorage)
  // ==========================================================================

  /** Encryption key identifier (internal use) */
  _ENCRYPTION_KEY_ID: '_sec_key_id',
} as const;

/**
 * Type for storage key values
 */
export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/**
 * Helper to get draft key for a specific entity
 */
export function getDraftKey(entityType: string, entityId: string): string {
  return `${STORAGE_KEYS.DRAFT_PREFIX}${entityType}-${entityId}`;
}

/**
 * Helper to get draft metadata key for a specific entity type
 */
export function getDraftMetadataKey(entityType: string): string {
  return `${STORAGE_KEYS.DRAFT_METADATA_PREFIX}${entityType}`;
}

/**
 * Helper to get recent searches key for a category
 */
export function getRecentSearchesKey(category: string): string {
  return `${STORAGE_KEYS.RECENT_SEARCHES_PREFIX}${category}`;
}

/**
 * Helper to get mobile cache key
 */
export function getMobileCacheKey(key: string): string {
  return `${STORAGE_KEYS.MOBILE_CACHE_PREFIX}${key}`;
}

/**
 * Clear all app-specific storage (for logout/reset)
 */
export function clearAllAppStorage(): void {
  const keysToRemove: string[] = [];

  // Collect all keys that match our prefixes
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      // Check if it's one of our keys or prefixes
      if (
        Object.values(STORAGE_KEYS).some(
          storageKey => key === storageKey || key.startsWith(storageKey)
        ) ||
        key.startsWith('myk9show-') ||
        key.startsWith('k9show-') ||
        key.startsWith('draft-') ||
        key.startsWith('mobile_')
      ) {
        keysToRemove.push(key);
      }
    }
  }

  // Remove collected keys
  keysToRemove.forEach(key => localStorage.removeItem(key));
}

/**
 * Get all app storage keys (for debugging)
 */
export function getAllAppStorageKeys(): string[] {
  const keys: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      if (
        Object.values(STORAGE_KEYS).some(
          storageKey => key === storageKey || key.startsWith(storageKey)
        ) ||
        key.startsWith('myk9show-') ||
        key.startsWith('k9show-') ||
        key.startsWith('draft-') ||
        key.startsWith('mobile_')
      ) {
        keys.push(key);
      }
    }
  }

  return keys.sort();
}
