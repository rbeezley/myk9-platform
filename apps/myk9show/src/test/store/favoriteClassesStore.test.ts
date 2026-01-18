import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useFavoriteClassesStore } from '@/store/favoriteClassesStore';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('favoriteClassesStore', () => {
  beforeEach(() => {
    // Reset store state
    useFavoriteClassesStore.setState({
      trialId: null,
      favorites: new Set(),
      justToggled: null,
    });
    // Clear localStorage mock
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('loadFavorites', () => {
    it('should load empty favorites for new trial', () => {
      const { loadFavorites } = useFavoriteClassesStore.getState();

      loadFavorites('trial-123');

      const state = useFavoriteClassesStore.getState();
      expect(state.trialId).toBe('trial-123');
      expect(state.favorites.size).toBe(0);
    });

    it('should load existing favorites from localStorage', () => {
      localStorageMock.setItem(
        'myk9show_favorites_trial-123',
        JSON.stringify(['class-1', 'class-2'])
      );

      const { loadFavorites } = useFavoriteClassesStore.getState();
      loadFavorites('trial-123');

      const state = useFavoriteClassesStore.getState();
      expect(state.favorites.has('class-1')).toBe(true);
      expect(state.favorites.has('class-2')).toBe(true);
      expect(state.favorites.size).toBe(2);
    });

    it('should handle corrupted localStorage data', () => {
      localStorageMock.setItem('myk9show_favorites_trial-123', 'invalid-json');

      const { loadFavorites } = useFavoriteClassesStore.getState();
      loadFavorites('trial-123');

      const state = useFavoriteClassesStore.getState();
      expect(state.favorites.size).toBe(0);
    });
  });

  describe('toggleFavorite', () => {
    beforeEach(() => {
      const { loadFavorites } = useFavoriteClassesStore.getState();
      loadFavorites('trial-123');
    });

    it('should add class to favorites when not favorited', () => {
      const { toggleFavorite, isFavorite } = useFavoriteClassesStore.getState();

      expect(isFavorite('class-1')).toBe(false);

      toggleFavorite('class-1');

      const state = useFavoriteClassesStore.getState();
      expect(state.isFavorite('class-1')).toBe(true);
    });

    it('should remove class from favorites when already favorited', () => {
      const { toggleFavorite } = useFavoriteClassesStore.getState();

      toggleFavorite('class-1'); // Add
      expect(useFavoriteClassesStore.getState().isFavorite('class-1')).toBe(true);

      toggleFavorite('class-1'); // Remove
      expect(useFavoriteClassesStore.getState().isFavorite('class-1')).toBe(false);
    });

    it('should save to localStorage on toggle', () => {
      const { toggleFavorite } = useFavoriteClassesStore.getState();

      toggleFavorite('class-1');

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'myk9show_favorites_trial-123',
        expect.any(String)
      );

      const savedData = JSON.parse(
        localStorageMock.setItem.mock.calls[0][1]
      );
      expect(savedData).toContain('class-1');
    });

    it('should set justToggled for animation', () => {
      const { toggleFavorite } = useFavoriteClassesStore.getState();

      toggleFavorite('class-1');

      const state = useFavoriteClassesStore.getState();
      expect(state.justToggled).toBe('class-1');
    });

    it('should not toggle without trialId', () => {
      // Reset to no trial
      useFavoriteClassesStore.setState({ trialId: null });

      const { toggleFavorite } = useFavoriteClassesStore.getState();
      toggleFavorite('class-1');

      expect(useFavoriteClassesStore.getState().isFavorite('class-1')).toBe(false);
    });
  });

  describe('isFavorite', () => {
    it('should return true for favorited class', () => {
      useFavoriteClassesStore.setState({
        trialId: 'trial-123',
        favorites: new Set(['class-1', 'class-2']),
      });

      const { isFavorite } = useFavoriteClassesStore.getState();
      expect(isFavorite('class-1')).toBe(true);
      expect(isFavorite('class-2')).toBe(true);
    });

    it('should return false for non-favorited class', () => {
      useFavoriteClassesStore.setState({
        trialId: 'trial-123',
        favorites: new Set(['class-1']),
      });

      const { isFavorite } = useFavoriteClassesStore.getState();
      expect(isFavorite('class-3')).toBe(false);
    });
  });

  describe('clearJustToggled', () => {
    it('should clear justToggled state', () => {
      useFavoriteClassesStore.setState({ justToggled: 'class-1' });

      const { clearJustToggled } = useFavoriteClassesStore.getState();
      clearJustToggled();

      expect(useFavoriteClassesStore.getState().justToggled).toBe(null);
    });
  });

  describe('trial isolation', () => {
    it('should maintain separate favorites per trial', () => {
      const { loadFavorites, toggleFavorite } = useFavoriteClassesStore.getState();

      // Set up trial 1 favorites
      loadFavorites('trial-1');
      toggleFavorite('class-a');

      // Switch to trial 2
      loadFavorites('trial-2');
      toggleFavorite('class-b');

      // Verify trial 2 state
      expect(useFavoriteClassesStore.getState().isFavorite('class-b')).toBe(true);
      expect(useFavoriteClassesStore.getState().isFavorite('class-a')).toBe(false);

      // Switch back to trial 1
      loadFavorites('trial-1');
      expect(useFavoriteClassesStore.getState().isFavorite('class-a')).toBe(true);
      expect(useFavoriteClassesStore.getState().isFavorite('class-b')).toBe(false);
    });
  });
});
