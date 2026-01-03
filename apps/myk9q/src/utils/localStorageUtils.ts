/**
 * Local Storage Utilities
 *
 * Safe wrappers for localStorage operations with error handling, type safety,
 * and quota management. Eliminates repetitive try-catch blocks across the codebase.
 *
 * Used across 90+ locations in Settings, ClassList, CompetitionAdmin, and notificationService.
 */

import { logger } from '@/utils/logger';

/**
 * Safely get and parse JSON data from localStorage
 *
 * Handles:
 * - Missing keys (returns default value)
 * - Invalid JSON (returns default value)
 * - Type validation with optional validator function
 * - Browser compatibility (SSR-safe)
 *
 * @param key - localStorage key
 * @param defaultValue - Value to return if key doesn't exist or parsing fails
 * @param validator - Optional function to validate parsed data
 * @returns Parsed value or default value
 *
 * @example
 * ```typescript
 * // Simple usage
 * const username = safeLocalStorageGet('username', 'Guest');
 *
 * // With type validation
 * const favorites = safeLocalStorageGet<number[]>(
 *   'favorites',
 *   [],
 *   (val) => Array.isArray(val) && val.every(id => typeof id === 'number')
 * );
 *
 * // With object validation
 * const config = safeLocalStorageGet<{theme: string}>(
 *   'config',
 *   {theme: 'light'},
 *   (val) => typeof val === 'object' && 'theme' in val
 * );
 * ```
 */
export function safeLocalStorageGet<T = unknown>(
  key: string,
  defaultValue: T,
  validator?: (value: unknown) => boolean
): T {
  // SSR safety - return default if localStorage is not available
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return defaultValue;
  }

  try {
    const item = localStorage.getItem(key);

    // Key doesn't exist (handle both null and undefined for test environment compatibility)
    if (item === null || item === undefined) {
      return defaultValue;
    }

    // Parse JSON
    const parsed = JSON.parse(item);

    // Validate if validator provided
    if (validator && !validator(parsed)) {
      logger.warn(`[localStorage] Invalid data for key "${key}", using default value`);
      return defaultValue;
    }

    return parsed as T;
  } catch (error) {
    logger.error(`[localStorage] Error reading key "${key}":`, error);
    return defaultValue;
  }
}

/**
 * Safely stringify and save data to localStorage
 *
 * Handles:
 * - JSON serialization errors
 * - QuotaExceededError (storage full)
 * - Browser compatibility (SSR-safe)
 * - Automatic error logging
 *
 * @param key - localStorage key
 * @param value - Value to save (will be JSON.stringify'd)
 * @returns true if save succeeded, false otherwise
 *
 * @example
 * ```typescript
 * // Save simple value
 * safeLocalStorageSet('theme', 'dark');
 *
 * // Save object
 * safeLocalStorageSet('user', {name: 'John', id: 123});
 *
 * // Save array
 * safeLocalStorageSet('favorites', [1, 2, 3]);
 *
 * // Check success
 * const success = safeLocalStorageSet('large-data', bigObject);
 * if (!success) {
 *   alert('Failed to save data - storage may be full');
 * }
 * ```
 */
export function safeLocalStorageSet(key: string, value: unknown): boolean {
  // SSR safety - fail silently if localStorage is not available
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return false;
  }

  try {
    const serialized = JSON.stringify(value);
    localStorage.setItem(key, serialized);
    return true;
  } catch (error) {
    // Handle quota exceeded error
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      logger.error(`[localStorage] Storage quota exceeded for key "${key}". Consider clearing old data.`);
    }
    // Handle serialization errors
    else if (error instanceof TypeError) {
      logger.error(`[localStorage] Cannot serialize value for key "${key}":`, error);
    }
    // Generic error
    else {
      logger.error(`[localStorage] Error saving key "${key}":`, error);
    }
    return false;
  }
}

/**
 * Safely remove a key from localStorage
 *
 * @param key - localStorage key to remove
 * @returns true if removal succeeded (or key didn't exist), false on error
 *
 * @example
 * ```typescript
 * safeLocalStorageRemove('old-config');
 * ```
 */
export function safeLocalStorageRemove(key: string): boolean {
  // SSR safety
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return false;
  }

  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    logger.error(`[localStorage] Error removing key "${key}":`, error);
    return false;
  }
}

/**
 * Check if a key exists in localStorage
 *
 * @param key - localStorage key to check
 * @returns true if key exists, false otherwise
 *
 * @example
 * ```typescript
 * if (localStorageHas('user-preferences')) {
 *   // Load preferences
 * } else {
 *   // Use defaults
 * }
 * ```
 */
export function localStorageHas(key: string): boolean {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return false;
  }

  try {
    const item = localStorage.getItem(key);
    return item !== null && item !== undefined;
  } catch (error) {
    logger.error(`[localStorage] Error checking key "${key}":`, error);
    return false;
  }
}

/**
 * Get all localStorage keys matching a prefix
 *
 * Useful for cleanup operations or migrating data.
 *
 * @param prefix - Key prefix to match (e.g., "favorites_")
 * @returns Array of matching keys
 *
 * @example
 * ```typescript
 * // Find all favorites keys
 * const favoriteKeys = getLocalStorageKeys('favorites_');
 * // ['favorites_123_456', 'favorites_123_789']
 *
 * // Clean up old keys
 * favoriteKeys.forEach(key => safeLocalStorageRemove(key));
 * ```
 */
export function getLocalStorageKeys(prefix: string): string[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return [];
  }

  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        keys.push(key);
      }
    }
    return keys;
  } catch (error) {
    logger.error(`[localStorage] Error getting keys with prefix "${prefix}":`, error);
    return [];
  }
}
