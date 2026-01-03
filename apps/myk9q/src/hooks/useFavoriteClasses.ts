/**
 * useFavoriteClasses Hook
 *
 * Manages class favorites with localStorage persistence and class data synchronization.
 * Extracts ~80 lines of favorites logic from ClassList.tsx.
 *
 * Features:
 * - Load favorites from localStorage on mount
 * - Save favorites to localStorage on changes
 * - Synchronize is_favorite property with class data
 * - Toggle favorite status
 * - Track loading state
 *
 * Dependencies:
 * - favoritesUtils (Phase 1) for localStorage operations
 */

import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/utils/logger';
import {
  loadFavoritesAsSet,
  saveFavoritesToLocalStorage,
} from '../utils/favoritesUtils';

export interface UseFavoriteClassesOptions {
  /**
   * Show license key for favorites storage
   */
  licenseKey: string | null | undefined;

  /**
   * Trial ID for favorites storage
   */
  trialId: string | number | undefined;

  /**
   * Optional callback when favorites change
   */
  onFavoritesChange?: (favoriteIds: Set<number>) => void;
}

export interface UseFavoriteClassesReturn {
  /**
   * Set of favorite class IDs
   */
  favoriteClasses: Set<number>;

  /**
   * Whether favorites have been loaded from localStorage
   */
  favoritesLoaded: boolean;

  /**
   * Toggle favorite status for a class
   */
  toggleFavorite: (classId: number) => void;

  /**
   * Check if a class is favorited
   */
  isFavorite: (classId: number) => boolean;

  /**
   * Add a class to favorites
   */
  addFavorite: (classId: number) => void;

  /**
   * Remove a class from favorites
   */
  removeFavorite: (classId: number) => void;

  /**
   * Clear all favorites
   */
  clearFavorites: () => void;
}

/**
 * Custom hook for managing class favorites with localStorage persistence
 *
 * Consolidates the favorites logic from ClassList.tsx (lines 48-155).
 * Handles loading, saving, and synchronizing favorites with class data.
 *
 * @param options - Configuration options
 * @returns Favorites state and methods
 *
 * @example
 * ```typescript
 * const {
 *   favoriteClasses,
 *   favoritesLoaded,
 *   toggleFavorite,
 *   isFavorite
 * } = useFavoriteClasses({
 *   licenseKey: showContext?.licenseKey,
 *   trialId: trialId
 * });
 *
 * // Use in class list
 * const updatedClasses = classes.map(c => ({
 *   ...c,
 *   is_favorite: isFavorite(c.id)
 * }));
 * ```
 */
export function useFavoriteClasses(
  options: UseFavoriteClassesOptions
): UseFavoriteClassesReturn {
  const { licenseKey, trialId, onFavoritesChange } = options;

  const [favoriteClasses, setFavoriteClasses] = useState<Set<number>>(() => {
return new Set();
  });
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);

  // Load favorites from localStorage on component mount
  useEffect(() => {
    const loadFavorites = () => {
      try {
        const loaded = loadFavoritesAsSet('class', licenseKey, { trialId });
setFavoriteClasses(loaded);
        setFavoritesLoaded(true);
      } catch (error) {
        logger.error('Error loading favorites from localStorage:', error);
        setFavoritesLoaded(true); // Mark as loaded even on error
      }
    };

    if (licenseKey && trialId) {
      loadFavorites();
    }
  }, [licenseKey, trialId]);

  // Save favorites to localStorage whenever favoriteClasses changes (but only after initial load)
  useEffect(() => {
    if (licenseKey && trialId && favoritesLoaded) {
      try {
        saveFavoritesToLocalStorage('class', licenseKey, favoriteClasses, { trialId });

// Notify parent of changes
        if (onFavoritesChange) {
          onFavoritesChange(favoriteClasses);
        }
      } catch (error) {
        logger.error('Error saving favorites to localStorage:', error);
      }
    }
  }, [favoriteClasses, licenseKey, trialId, favoritesLoaded, onFavoritesChange]);

  // Toggle favorite status
  const toggleFavorite = useCallback((classId: number) => {
    setFavoriteClasses((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(classId)) {
newSet.delete(classId);
      } else {
newSet.add(classId);
      }
      return newSet;
    });
  }, []);

  // Check if a class is favorited
  const isFavorite = useCallback(
    (classId: number): boolean => {
      return favoriteClasses.has(classId);
    },
    [favoriteClasses]
  );

  // Add a class to favorites
  const addFavorite = useCallback((classId: number) => {
    setFavoriteClasses((prev) => {
      const newSet = new Set(prev);
      newSet.add(classId);
      return newSet;
    });
  }, []);

  // Remove a class from favorites
  const removeFavorite = useCallback((classId: number) => {
    setFavoriteClasses((prev) => {
      const newSet = new Set(prev);
      newSet.delete(classId);
      return newSet;
    });
  }, []);

  // Clear all favorites
  const clearFavorites = useCallback(() => {
    setFavoriteClasses(new Set());
  }, []);

  return {
    favoriteClasses,
    favoritesLoaded,
    toggleFavorite,
    isFavorite,
    addFavorite,
    removeFavorite,
    clearFavorites,
  };
}
