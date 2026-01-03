/**
 * Favorites Utilities
 *
 * Centralized utilities for managing favorites in localStorage across the application.
 * Eliminates 8+ instances of duplicate parsing logic and 5+ instances of duplicate
 * saving logic across Settings, ClassList, Home, and notification services.
 *
 * Used for:
 * - Dog favorites (favorite competitor armbands)
 * - Class favorites (favorite trial classes)
 */

import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from './localStorageUtils';
import { logger } from '@/utils/logger';

/**
 * Favorites type - 'dog' for competitor favorites, 'class' for trial class favorites
 */
export type FavoritesType = 'dog' | 'class';

/**
 * Options for building favorites storage keys
 */
export interface FavoritesKeyOptions {
  /** Trial ID for class favorites (required for type='class') */
  trialId?: string | number;
  /** Use 'default' as fallback if licenseKey is missing */
  useDefault?: boolean;
}

/**
 * Build a consistent localStorage key for favorites
 *
 * Handles multiple key patterns used across the codebase:
 * - Dog favorites: `dog_favorites_{licenseKey}`
 * - Class favorites: `favorites_{licenseKey}_{trialId}`
 * - With default fallback: `dog_favorites_default`
 *
 * @param type - Type of favorites ('dog' or 'class')
 * @param licenseKey - Show license key
 * @param options - Additional options (trialId, useDefault)
 * @returns localStorage key string
 *
 * @example
 * ```typescript
 * // Dog favorites
 * buildFavoritesKey('dog', 'ABC123'); // 'dog_favorites_ABC123'
 *
 * // Dog favorites with default fallback
 * buildFavoritesKey('dog', null, { useDefault: true }); // 'dog_favorites_default'
 *
 * // Class favorites with trial ID
 * buildFavoritesKey('class', 'ABC123', { trialId: 456 }); // 'favorites_ABC123_456'
 * ```
 */
export function buildFavoritesKey(
  type: FavoritesType,
  licenseKey: string | null | undefined,
  options: FavoritesKeyOptions = {}
): string {
  const { trialId, useDefault = false } = options;

  // Use default fallback if requested and licenseKey is missing
  const effectiveKey = licenseKey || (useDefault ? 'default' : '');

  if (!effectiveKey) {
    logger.warn('[favoritesUtils] Building favorites key without licenseKey');
  }

  // Build key based on type
  if (type === 'dog') {
    return `dog_favorites_${effectiveKey}`;
  } else {
    // Class favorites require trial ID
    if (!trialId) {
      logger.warn('[favoritesUtils] Class favorites key built without trialId');
    }
    return `favorites_${effectiveKey}_${trialId || ''}`;
  }
}

/**
 * Parse favorites from localStorage with comprehensive validation
 *
 * Handles:
 * - Missing keys (returns empty array)
 * - Invalid JSON (returns empty array, clears corrupted data)
 * - Non-array data (returns empty array, clears corrupted data)
 * - Non-number array items (returns empty array, clears corrupted data)
 * - Consistent error logging
 *
 * This consolidates the parsing logic found in 8+ locations:
 * - Settings.tsx (lines 249-263)
 * - Home.tsx (lines 113-148)
 * - ClassList.tsx (lines 112-138)
 * - usePushNotificationAutoSwitch.ts (lines 52-65, 115-128)
 * - notificationIntegration.ts (lines 115-136)
 *
 * @param type - Type of favorites ('dog' or 'class')
 * @param licenseKey - Show license key
 * @param options - Additional options (trialId, useDefault)
 * @returns Array of favorite IDs (empty array if no valid data)
 *
 * @example
 * ```typescript
 * // Load dog favorites
 * const dogFavorites = parseFavoritesFromLocalStorage('dog', 'ABC123');
 * // Returns: [101, 202, 303] or []
 *
 * // Load class favorites with trial ID
 * const classFavorites = parseFavoritesFromLocalStorage('class', 'ABC123', { trialId: 456 });
 * // Returns: [1, 2, 3] or []
 *
 * // Load with default fallback
 * const favorites = parseFavoritesFromLocalStorage('dog', null, { useDefault: true });
 * // Uses key 'dog_favorites_default'
 * ```
 */
export function parseFavoritesFromLocalStorage(
  type: FavoritesType,
  licenseKey: string | null | undefined,
  options: FavoritesKeyOptions = {}
): number[] {
  const key = buildFavoritesKey(type, licenseKey, options);

  // Use safe localStorage getter with validator
  const favorites = safeLocalStorageGet<number[]>(
    key,
    [], // Default to empty array
    (value) => Array.isArray(value) && value.every((id) => typeof id === 'number')
  );

  // If validation failed, the validator will have logged a warning
  // Check if we need to clear corrupted data
  if (favorites.length === 0) {
    // Check if there was actually data in storage that failed validation
    const rawData = localStorage.getItem(key);
    if (rawData && rawData !== 'null' && rawData !== '[]') {
      // Data exists but is invalid - clear it
      logger.warn(`[favoritesUtils] Clearing corrupted ${type} favorites data for key: ${key}`);
      safeLocalStorageRemove(key);
    }
  }

  return favorites;
}

/**
 * Save favorites to localStorage with error handling
 *
 * Handles:
 * - Set<number> to number[] conversion
 * - JSON serialization
 * - Storage quota errors
 * - Consistent error logging
 *
 * This consolidates the saving logic found in 5+ locations:
 * - Home.tsx (lines 151-165)
 * - ClassList.tsx (lines 141-155)
 * - Settings.tsx
 * - Various other components
 *
 * @param type - Type of favorites ('dog' or 'class')
 * @param licenseKey - Show license key
 * @param favorites - Set or Array of favorite IDs
 * @param options - Additional options (trialId, useDefault)
 * @returns true if save succeeded, false otherwise
 *
 * @example
 * ```typescript
 * // Save dog favorites from Set
 * const dogFavorites = new Set([101, 202, 303]);
 * saveFavoritesToLocalStorage('dog', 'ABC123', dogFavorites);
 *
 * // Save class favorites from Array
 * const classFavorites = [1, 2, 3];
 * saveFavoritesToLocalStorage('class', 'ABC123', classFavorites, { trialId: 456 });
 *
 * // Check if save succeeded
 * const success = saveFavoritesToLocalStorage('dog', 'ABC123', favorites);
 * if (!success) {
 *   logger.error('Failed to save favorites');
 * }
 * ```
 */
export function saveFavoritesToLocalStorage(
  type: FavoritesType,
  licenseKey: string | null | undefined,
  favorites: Set<number> | number[],
  options: FavoritesKeyOptions = {}
): boolean {
  const key = buildFavoritesKey(type, licenseKey, options);

  // Convert Set to Array if needed
  const favoriteIds = favorites instanceof Set ? Array.from(favorites) : favorites;

  // Validate that all IDs are numbers
  if (!favoriteIds.every((id) => typeof id === 'number')) {
    logger.error(
      `[favoritesUtils] Cannot save ${type} favorites - array contains non-number values:`,
      favoriteIds
    );
    return false;
  }

  // Use safe localStorage setter
  const success = safeLocalStorageSet(key, favoriteIds);
  return success;
}

/**
 * Load favorites as a Set<number>
 *
 * Convenience wrapper around parseFavoritesFromLocalStorage that returns a Set.
 * Many React components use Sets for favorites state (Home.tsx, ClassList.tsx).
 *
 * @param type - Type of favorites ('dog' or 'class')
 * @param licenseKey - Show license key
 * @param options - Additional options (trialId, useDefault)
 * @returns Set of favorite IDs (empty Set if no valid data)
 *
 * @example
 * ```typescript
 * // Load dog favorites as Set
 * const [favoriteDogs, setFavoriteDogs] = useState<Set<number>>(new Set());
 *
 * useEffect(() => {
 *   setFavoriteDogs(loadFavoritesAsSet('dog', licenseKey));
 * }, [licenseKey]);
 * ```
 */
export function loadFavoritesAsSet(
  type: FavoritesType,
  licenseKey: string | null | undefined,
  options: FavoritesKeyOptions = {}
): Set<number> {
  const favorites = parseFavoritesFromLocalStorage(type, licenseKey, options);
  return new Set(favorites);
}

/**
 * Clear favorites from localStorage
 *
 * @param type - Type of favorites ('dog' or 'class')
 * @param licenseKey - Show license key
 * @param options - Additional options (trialId, useDefault)
 * @returns true if removal succeeded, false otherwise
 *
 * @example
 * ```typescript
 * // Clear dog favorites
 * clearFavorites('dog', 'ABC123');
 *
 * // Clear class favorites for specific trial
 * clearFavorites('class', 'ABC123', { trialId: 456 });
 * ```
 */
export function clearFavorites(
  type: FavoritesType,
  licenseKey: string | null | undefined,
  options: FavoritesKeyOptions = {}
): boolean {
  const key = buildFavoritesKey(type, licenseKey, options);
  const success = safeLocalStorageRemove(key);
  return success;
}
