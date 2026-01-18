import { create } from 'zustand';

const STORAGE_KEY_PREFIX = 'myk9show_favorites_';

/**
 * Build localStorage key for favorites
 */
function buildStorageKey(trialId: string): string {
  return `${STORAGE_KEY_PREFIX}${trialId}`;
}

/**
 * Load favorites from localStorage
 */
function loadFromStorage(trialId: string): Set<string> {
  try {
    const key = buildStorageKey(trialId);
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return new Set(parsed);
      }
    }
  } catch {
    // Ignore parse errors
  }
  return new Set();
}

/**
 * Save favorites to localStorage
 */
function saveToStorage(trialId: string, favorites: Set<string>): void {
  try {
    const key = buildStorageKey(trialId);
    localStorage.setItem(key, JSON.stringify([...favorites]));
  } catch {
    // Ignore storage errors
  }
}

interface FavoriteClassesState {
  /** Current trial ID */
  trialId: string | null;
  /** Set of favorite class IDs */
  favorites: Set<string>;
  /** Class ID that was just toggled (for animation) */
  justToggled: string | null;

  /** Load favorites for a trial from localStorage */
  loadFavorites: (trialId: string) => void;

  /** Toggle favorite status for a class */
  toggleFavorite: (classId: string) => void;

  /** Check if a class is favorited */
  isFavorite: (classId: string) => boolean;

  /** Clear the justToggled state (call after animation) */
  clearJustToggled: () => void;
}

export const useFavoriteClassesStore = create<FavoriteClassesState>()((set, get) => ({
  trialId: null,
  favorites: new Set(),
  justToggled: null,

  loadFavorites: (trialId: string) => {
    const favorites = loadFromStorage(trialId);
    set({ trialId, favorites });
  },

  toggleFavorite: (classId: string) => {
    const { trialId, favorites } = get();
    if (!trialId) return;

    const newFavorites = new Set(favorites);
    if (newFavorites.has(classId)) {
      newFavorites.delete(classId);
    } else {
      newFavorites.add(classId);
    }

    // Save to localStorage
    saveToStorage(trialId, newFavorites);

    // Update state with animation trigger
    set({ favorites: newFavorites, justToggled: classId });

    // Clear animation trigger after 400ms
    setTimeout(() => {
      set((state) => (state.justToggled === classId ? { justToggled: null } : {}));
    }, 400);
  },

  isFavorite: (classId: string) => {
    return get().favorites.has(classId);
  },

  clearJustToggled: () => {
    set({ justToggled: null });
  },
}));
