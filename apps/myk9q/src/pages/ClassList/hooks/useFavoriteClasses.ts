/**
 * useFavoriteClasses Hook
 *
 * Manages favorite classes with localStorage persistence.
 * Handles loading, saving, and toggling favorites.
 *
 * Extracted from ClassList.tsx
 */

import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/utils/logger';

/**
 * Hook return type
 */
export interface UseFavoriteClassesReturn {
  /** Set of favorite class IDs */
  favoriteClasses: Set<number>;
  /** Whether favorites have been loaded from localStorage */
  favoritesLoaded: boolean;
  /** Check if a class is a favorite */
  isFavorite: (classId: number) => boolean;
  /** Toggle favorite status for a class (handles paired classes) */
  toggleFavorite: (classId: number, pairedClassId?: number) => void;
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
  const [favoriteClasses, setFavoriteClasses] = useState<Set<number>>(() => {
return new Set();
  });
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);

  // Load favorites from localStorage on mount
  useEffect(() => {
    const loadFavorites = () => {
      try {
        const favoritesKey = `favorites_${licenseKey || 'default'}_${trialId}`;
        const savedFavorites = localStorage.getItem(favoritesKey);
if (savedFavorites) {
          const favoriteIds = JSON.parse(savedFavorites) as number[];
setFavoriteClasses(new Set(favoriteIds));
        } else {
setFavoriteClasses(new Set());
        }
        setFavoritesLoaded(true);
      } catch (error) {
        logger.error('Error loading favorites from localStorage:', error);
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
  const isFavorite = useCallback((classId: number): boolean => {
    return favoriteClasses.has(classId);
  }, [favoriteClasses]);

  /**
   * Toggle favorite status for a class
   * Handles paired Novice A/B classes by toggling both
   */
  const toggleFavorite = useCallback((classId: number, pairedClassId?: number) => {
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
