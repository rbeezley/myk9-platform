/**
 * useFavoriteClasses Hook
 *
 * Manages favorite classes with localStorage persistence.
 * Handles loading, saving, and toggling favorites.
 *
 * Extracted from ClassList.tsx
 */

import { useState, useEffect, useCallback } from 'react';
import { logger } from '@myk9/core';

/**
 * Hook return type
 */
export interface UseFavoriteClassesReturn {
  /** Set of favorite class IDs */
  favoriteClasses: Set<string>;
  /** Whether favorites have been loaded from localStorage */
  favoritesLoaded: boolean;
  /** Check if a class is a favorite */
  isFavorite: (classId: string) => boolean;
  /** Toggle favorite status for a class (handles paired classes) */
  toggleFavorite: (classId: string, pairedClassId?: string) => void;
}

/**
 * Custom hook for managing favorite classes
 *
 * Provides functionality for:
 * - **localStorage Persistence**: Saves favorites per license key + trial
 * - **Loading**: Loads favorites on mount from localStorage
 * - **Toggling**: Add/remove class IDs from favorites set
 * - **Paired Classes**: Automatically handles paired Novice A/B classes
 *
 * **Storage Key Pattern**: `favorites_{licenseKey}_{trialId}`
 * **Paired Classes**: When toggling a paired class, both IDs are updated together
 *
 * @param licenseKey - License key for storage key (undefined if not available)
 * @param trialId - Trial ID for storage key (undefined if not available)
 * @returns Favorites state and control methods
 *
 * @example
 * ```tsx
 * function ClassList() {
 *   const {
 *     favoriteClasses,
 *     favoritesLoaded,
 *     isFavorite,
 *     toggleFavorite
 *   } = useFavoriteClasses(licenseKey, trialId);
 *
 *   // Update classes with favorite status
 *   useEffect(() => {
 *     if (favoritesLoaded && classes.length > 0) {
 *       setClasses(prev => prev.map(c => ({
 *         ...c,
 *         is_favorite: isFavorite(c.id)
 *       })));
 *     }
 *   }, [favoriteClasses, favoritesLoaded]);
 *
 *   const handleToggle = (classId: number, pairedId?: number) => {
 *     hapticFeedback.medium();
 *     toggleFavorite(classId, pairedId);
 *   };
 *
 *   return (
 *     <div>
 *       {classes.map(cls => (
 *         <ClassCard
 *           key={cls.id}
 *           isFavorite={isFavorite(cls.id)}
 *           onToggleFavorite={() => handleToggle(cls.id, cls.pairedClassId)}
 *         />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useFavoriteClasses(
  licenseKey: string | undefined,
  trialId: string | undefined
): UseFavoriteClassesReturn {
  // State
  const [favoriteClasses, setFavoriteClasses] = useState<Set<string>>(() => {
return new Set();
  });
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);

  // Load favorites from localStorage on mount
  useEffect(() => {
    const loadFavorites = () => {
      const favoritesKey = `favorites_${licenseKey || 'default'}_${trialId}`;
      try {
        const savedFavorites = localStorage.getItem(favoritesKey);
        if (savedFavorites) {
          const parsed = JSON.parse(savedFavorites);
          if (Array.isArray(parsed)) {
            // Filter to string ids (UUID-native) — defends against accidental
            // corruption (e.g. a legacy numeric id) while preserving valid entries.
            const ids = parsed.filter((id): id is string => typeof id === 'string');
            setFavoriteClasses(new Set(ids));
          } else {
            // Valid JSON, wrong shape — treat as corrupt.
            throw new Error('Stored favorites payload is not an array');
          }
        } else {
          setFavoriteClasses(new Set());
        }
        setFavoritesLoaded(true);
      } catch (error) {
        // Recovery contract: log, clear the corrupt key so the next
        // session starts clean, reset state to empty, and mark loaded
        // so future toggles persist normally instead of being silently
        // dropped by the save guard.
        logger.error('Error loading favorites from localStorage:', error);
        try {
          localStorage.removeItem(favoritesKey);
        } catch (removeError) {
          logger.error('Error clearing corrupt favorites key:', removeError);
        }
        setFavoriteClasses(new Set());
        setFavoritesLoaded(true);
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
        const favoritesKey = `favorites_${licenseKey}_${trialId}`;
        const favoriteIds = Array.from(favoriteClasses);
localStorage.setItem(favoritesKey, JSON.stringify(favoriteIds));
} catch (error) {
        logger.error('Error saving favorites to localStorage:', error);
      }
    }
  }, [favoriteClasses, licenseKey, trialId, favoritesLoaded]);

  /**
   * Check if a class is a favorite
   */
  const isFavorite = useCallback((classId: string): boolean => {
    return favoriteClasses.has(classId);
  }, [favoriteClasses]);

  /**
   * Toggle favorite status for a class
   * Handles paired Novice A/B classes by toggling both
   */
  const toggleFavorite = useCallback((classId: string, pairedClassId?: string) => {
const idsToToggle = pairedClassId ? [classId, pairedClassId] : [classId];

    setFavoriteClasses(prev => {
      const newFavorites = new Set(prev);
      const shouldAdd = !newFavorites.has(classId);

      idsToToggle.forEach(id => {
        if (shouldAdd) {
          newFavorites.add(id);
} else {
          newFavorites.delete(id);
}
      });

return newFavorites;
    });
  }, []);

  return {
    favoriteClasses,
    favoritesLoaded,
    isFavorite,
    toggleFavorite,
  };
}
