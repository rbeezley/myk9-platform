/**
 * Unit Tests for Favorites Utilities
 */

import {
  buildFavoritesKey,
  parseFavoritesFromLocalStorage,
  saveFavoritesToLocalStorage,
  loadFavoritesAsSet,
  clearFavorites,
  type FavoritesType,
} from './favoritesUtils';

// Mock localStorage (same pattern as localStorageUtils.test.ts)
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => {
      return key in store ? store[key] : null;
    },
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    },
    get length() {
      return Object.keys(store).length;
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('favoritesUtils', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('buildFavoritesKey', () => {
    describe('Dog favorites keys', () => {
      test('should build dog favorites key with licenseKey', () => {
        const key = buildFavoritesKey('dog', 'ABC123');
        expect(key).toBe('dog_favorites_ABC123');
      });

      test('should build dog favorites key with default fallback', () => {
        const key = buildFavoritesKey('dog', null, { useDefault: true });
        expect(key).toBe('dog_favorites_default');
      });

      test('should build dog favorites key with empty string when no licenseKey and no default', () => {
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const key = buildFavoritesKey('dog', null);
        expect(key).toBe('dog_favorites_');
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Building favorites key without licenseKey')
        );
        consoleSpy.mockRestore();
      });

      test('should handle undefined licenseKey', () => {
        const key = buildFavoritesKey('dog', undefined, { useDefault: true });
        expect(key).toBe('dog_favorites_default');
      });

      test('should handle empty string licenseKey with default', () => {
        const key = buildFavoritesKey('dog', '', { useDefault: true });
        expect(key).toBe('dog_favorites_default');
      });
    });

    describe('Class favorites keys', () => {
      test('should build class favorites key with licenseKey and trialId', () => {
        const key = buildFavoritesKey('class', 'ABC123', { trialId: 456 });
        expect(key).toBe('favorites_ABC123_456');
      });

      test('should build class favorites key with string trialId', () => {
        const key = buildFavoritesKey('class', 'ABC123', { trialId: '789' });
        expect(key).toBe('favorites_ABC123_789');
      });

      test('should warn when building class key without trialId', () => {
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const key = buildFavoritesKey('class', 'ABC123');
        expect(key).toBe('favorites_ABC123_');
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Class favorites key built without trialId')
        );
        consoleSpy.mockRestore();
      });

      test('should handle class favorites with default licenseKey', () => {
        const key = buildFavoritesKey('class', null, { trialId: 456, useDefault: true });
        expect(key).toBe('favorites_default_456');
      });
    });
  });

  describe('parseFavoritesFromLocalStorage', () => {
    describe('Dog favorites parsing', () => {
      test('should parse valid dog favorites from localStorage', () => {
        localStorageMock.setItem('dog_favorites_ABC123', JSON.stringify([101, 202, 303]));

        const favorites = parseFavoritesFromLocalStorage('dog', 'ABC123');
        expect(favorites).toEqual([101, 202, 303]);
      });

      test('should return empty array when no data exists', () => {
        const favorites = parseFavoritesFromLocalStorage('dog', 'ABC123');
        expect(favorites).toEqual([]);
      });

      test('should return empty array and clear corrupted JSON data', () => {
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        localStorageMock.setItem('dog_favorites_ABC123', 'not-valid-json{]');

        const favorites = parseFavoritesFromLocalStorage('dog', 'ABC123');
        expect(favorites).toEqual([]);

        // Should have cleared corrupted data
        expect(localStorageMock.getItem('dog_favorites_ABC123')).toBeNull();
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
      });

      test('should return empty array and clear non-array data', () => {
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        localStorageMock.setItem('dog_favorites_ABC123', JSON.stringify('not-an-array'));

        const favorites = parseFavoritesFromLocalStorage('dog', 'ABC123');
        expect(favorites).toEqual([]);

        // Should have cleared invalid data
        expect(localStorageMock.getItem('dog_favorites_ABC123')).toBeNull();
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
      });

      test('should return empty array and clear array with non-number items', () => {
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        localStorageMock.setItem('dog_favorites_ABC123', JSON.stringify([101, 'not-a-number', 303]));

        const favorites = parseFavoritesFromLocalStorage('dog', 'ABC123');
        expect(favorites).toEqual([]);

        // Should have cleared invalid data
        expect(localStorageMock.getItem('dog_favorites_ABC123')).toBeNull();
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
      });

      test('should handle dog favorites with default fallback', () => {
        localStorageMock.setItem('dog_favorites_default', JSON.stringify([1, 2, 3]));

        const favorites = parseFavoritesFromLocalStorage('dog', null, { useDefault: true });
        expect(favorites).toEqual([1, 2, 3]);
      });

      test('should not clear valid empty array', () => {
        localStorageMock.setItem('dog_favorites_ABC123', JSON.stringify([]));

        const favorites = parseFavoritesFromLocalStorage('dog', 'ABC123');
        expect(favorites).toEqual([]);

        // Should NOT have removed the key (empty array is valid)
        expect(localStorageMock.getItem('dog_favorites_ABC123')).toBe('[]');
      });
    });

    describe('Class favorites parsing', () => {
      test('should parse valid class favorites with trialId', () => {
        localStorageMock.setItem('favorites_ABC123_456', JSON.stringify([1, 2, 3]));

        const favorites = parseFavoritesFromLocalStorage('class', 'ABC123', { trialId: 456 });
        expect(favorites).toEqual([1, 2, 3]);
      });

      test('should handle class favorites with string trialId', () => {
        localStorageMock.setItem('favorites_ABC123_789', JSON.stringify([4, 5, 6]));

        const favorites = parseFavoritesFromLocalStorage('class', 'ABC123', { trialId: '789' });
        expect(favorites).toEqual([4, 5, 6]);
      });

      test('should return empty array when class favorites not found', () => {
        const favorites = parseFavoritesFromLocalStorage('class', 'ABC123', { trialId: 999 });
        expect(favorites).toEqual([]);
      });
    });
  });

  describe('saveFavoritesToLocalStorage', () => {
    describe('Dog favorites saving', () => {
      test('should save dog favorites from array', () => {
        const success = saveFavoritesToLocalStorage('dog', 'ABC123', [101, 202, 303]);
        expect(success).toBe(true);

        const saved = JSON.parse(localStorageMock.getItem('dog_favorites_ABC123')!);
        expect(saved).toEqual([101, 202, 303]);
      });

      test('should save dog favorites from Set', () => {
        const favorites = new Set([101, 202, 303]);
        const success = saveFavoritesToLocalStorage('dog', 'ABC123', favorites);
        expect(success).toBe(true);

        const saved = JSON.parse(localStorageMock.getItem('dog_favorites_ABC123')!);
        expect(saved).toEqual([101, 202, 303]);
      });

      test('should save empty array', () => {
        const success = saveFavoritesToLocalStorage('dog', 'ABC123', []);
        expect(success).toBe(true);

        const saved = JSON.parse(localStorageMock.getItem('dog_favorites_ABC123')!);
        expect(saved).toEqual([]);
      });

      test('should save empty Set', () => {
        const success = saveFavoritesToLocalStorage('dog', 'ABC123', new Set());
        expect(success).toBe(true);

        const saved = JSON.parse(localStorageMock.getItem('dog_favorites_ABC123')!);
        expect(saved).toEqual([]);
      });

      test('should handle dog favorites with default key', () => {
        const success = saveFavoritesToLocalStorage('dog', null, [1, 2], { useDefault: true });
        expect(success).toBe(true);

        const saved = JSON.parse(localStorageMock.getItem('dog_favorites_default')!);
        expect(saved).toEqual([1, 2]);
      });

      test('should reject array with non-number values', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const success = saveFavoritesToLocalStorage('dog', 'ABC123', [101, 'invalid', 303] as any);
        expect(success).toBe(false);
        expect(localStorageMock.getItem('dog_favorites_ABC123')).toBeNull();
        expect(consoleSpy).toHaveBeenCalled();
        expect(consoleSpy.mock.calls[0][0]).toContain('array contains non-number values');
        consoleSpy.mockRestore();
      });
    });

    describe('Class favorites saving', () => {
      test('should save class favorites with trialId', () => {
        const success = saveFavoritesToLocalStorage('class', 'ABC123', [1, 2, 3], { trialId: 456 });
        expect(success).toBe(true);

        const saved = JSON.parse(localStorageMock.getItem('favorites_ABC123_456')!);
        expect(saved).toEqual([1, 2, 3]);
      });

      test('should save class favorites from Set with trialId', () => {
        const favorites = new Set([4, 5, 6]);
        const success = saveFavoritesToLocalStorage('class', 'ABC123', favorites, { trialId: '789' });
        expect(success).toBe(true);

        const saved = JSON.parse(localStorageMock.getItem('favorites_ABC123_789')!);
        expect(saved).toEqual([4, 5, 6]);
      });
    });

    describe('Error handling', () => {
      test('should handle localStorage quota exceeded error', () => {
        const originalSetItem = localStorageMock.setItem;
        localStorageMock.setItem = vi.fn(() => {
          throw new DOMException('', 'QuotaExceededError');
        });

        const success = saveFavoritesToLocalStorage('dog', 'ABC123', [1, 2, 3]);
        expect(success).toBe(false);

        localStorageMock.setItem = originalSetItem;
      });
    });
  });

  describe('loadFavoritesAsSet', () => {
    test('should load dog favorites as Set', () => {
      localStorageMock.setItem('dog_favorites_ABC123', JSON.stringify([101, 202, 303]));

      const favorites = loadFavoritesAsSet('dog', 'ABC123');
      expect(favorites).toBeInstanceOf(Set);
      expect(favorites.size).toBe(3);
      expect(favorites.has(101)).toBe(true);
      expect(favorites.has(202)).toBe(true);
      expect(favorites.has(303)).toBe(true);
    });

    test('should return empty Set when no data exists', () => {
      const favorites = loadFavoritesAsSet('dog', 'ABC123');
      expect(favorites).toBeInstanceOf(Set);
      expect(favorites.size).toBe(0);
    });

    test('should load class favorites as Set with trialId', () => {
      localStorageMock.setItem('favorites_ABC123_456', JSON.stringify([1, 2, 3]));

      const favorites = loadFavoritesAsSet('class', 'ABC123', { trialId: 456 });
      expect(favorites).toBeInstanceOf(Set);
      expect(favorites.size).toBe(3);
      expect(Array.from(favorites)).toEqual([1, 2, 3]);
    });

    test('should handle duplicates in array (Set deduplication)', () => {
      localStorageMock.setItem('dog_favorites_ABC123', JSON.stringify([101, 101, 202, 202, 303]));

      const favorites = loadFavoritesAsSet('dog', 'ABC123');
      expect(favorites.size).toBe(3); // Duplicates removed
      expect(Array.from(favorites).sort()).toEqual([101, 202, 303]);
    });
  });

  describe('clearFavorites', () => {
    test('should clear dog favorites', () => {
      localStorageMock.setItem('dog_favorites_ABC123', JSON.stringify([101, 202, 303]));

      const success = clearFavorites('dog', 'ABC123');
      expect(success).toBe(true);
      expect(localStorageMock.getItem('dog_favorites_ABC123')).toBeNull();
    });

    test('should clear class favorites with trialId', () => {
      localStorageMock.setItem('favorites_ABC123_456', JSON.stringify([1, 2, 3]));

      const success = clearFavorites('class', 'ABC123', { trialId: 456 });
      expect(success).toBe(true);
      expect(localStorageMock.getItem('favorites_ABC123_456')).toBeNull();
    });

    test('should return true even if key does not exist', () => {
      const success = clearFavorites('dog', 'NONEXISTENT');
      expect(success).toBe(true);
    });

    test('should handle errors gracefully', () => {
      const originalRemoveItem = localStorageMock.removeItem;
      localStorageMock.removeItem = vi.fn(() => {
        throw new Error('Remove failed');
      });

      const success = clearFavorites('dog', 'ABC123');
      expect(success).toBe(false);

      localStorageMock.removeItem = originalRemoveItem;
    });
  });

  describe('Real-world scenarios', () => {
    test('should handle Settings.tsx dog favorites workflow', () => {
      const licenseKey = 'ABC123';

      // Initially no favorites
      const initial = parseFavoritesFromLocalStorage('dog', licenseKey);
      expect(initial).toEqual([]);

      // User favorites some dogs
      const favoriteArmbands = [101, 202, 303];
      saveFavoritesToLocalStorage('dog', licenseKey, favoriteArmbands);

      // Load favorites again
      const loaded = parseFavoritesFromLocalStorage('dog', licenseKey);
      expect(loaded).toEqual([101, 202, 303]);

      // Update favorites (add one, remove one)
      const updated = [101, 202, 404]; // Removed 303, added 404
      saveFavoritesToLocalStorage('dog', licenseKey, updated);

      // Verify update
      const reloaded = parseFavoritesFromLocalStorage('dog', licenseKey);
      expect(reloaded).toEqual([101, 202, 404]);
    });

    test('should handle Home.tsx dog favorites with Set workflow', () => {
      const licenseKey = 'ABC123';

      // Load favorites as Set (initially empty)
      let favoriteDogs = loadFavoritesAsSet('dog', licenseKey, { useDefault: true });
      expect(favoriteDogs.size).toBe(0);

      // Add favorites
      favoriteDogs.add(101);
      favoriteDogs.add(202);
      favoriteDogs.add(303);

      // Save favorites
      saveFavoritesToLocalStorage('dog', licenseKey, favoriteDogs, { useDefault: true });

      // Reload in new session
      favoriteDogs = loadFavoritesAsSet('dog', licenseKey, { useDefault: true });
      expect(favoriteDogs.size).toBe(3);
      expect(favoriteDogs.has(101)).toBe(true);
      expect(favoriteDogs.has(202)).toBe(true);
      expect(favoriteDogs.has(303)).toBe(true);
    });

    test('should handle ClassList.tsx class favorites workflow', () => {
      const licenseKey = 'ABC123';
      const trialId = 456;

      // Load favorites as Set
      let favoriteClasses = loadFavoritesAsSet('class', licenseKey, { trialId });
      expect(favoriteClasses.size).toBe(0);

      // User favorites some classes
      favoriteClasses.add(1);
      favoriteClasses.add(2);
      favoriteClasses.add(3);

      // Save favorites
      saveFavoritesToLocalStorage('class', licenseKey, favoriteClasses, { trialId });

      // Reload favorites (e.g., page refresh)
      favoriteClasses = loadFavoritesAsSet('class', licenseKey, { trialId });
      expect(favoriteClasses.size).toBe(3);
      expect(Array.from(favoriteClasses)).toEqual([1, 2, 3]);
    });

    test('should handle corrupted data recovery workflow', () => {
      const licenseKey = 'ABC123';
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Simulate corrupted data in localStorage
      localStorageMock.setItem('dog_favorites_ABC123', '{corrupted-json}');

      // Attempt to load - should return empty array and clear corrupted data
      const favorites = parseFavoritesFromLocalStorage('dog', licenseKey);
      expect(favorites).toEqual([]);
      expect(localStorageMock.getItem('dog_favorites_ABC123')).toBeNull();

      // Save new valid data
      saveFavoritesToLocalStorage('dog', licenseKey, [101, 202]);

      // Verify recovery
      const recovered = parseFavoritesFromLocalStorage('dog', licenseKey);
      expect(recovered).toEqual([101, 202]);

      consoleSpy.mockRestore();
    });

    test('should handle multiple trial favorites for same show', () => {
      const licenseKey = 'ABC123';

      // Save favorites for trial 1
      saveFavoritesToLocalStorage('class', licenseKey, [1, 2, 3], { trialId: 101 });

      // Save favorites for trial 2
      saveFavoritesToLocalStorage('class', licenseKey, [4, 5, 6], { trialId: 102 });

      // Load trial 1 favorites
      const trial1 = parseFavoritesFromLocalStorage('class', licenseKey, { trialId: 101 });
      expect(trial1).toEqual([1, 2, 3]);

      // Load trial 2 favorites
      const trial2 = parseFavoritesFromLocalStorage('class', licenseKey, { trialId: 102 });
      expect(trial2).toEqual([4, 5, 6]);

      // Clear trial 1 favorites
      clearFavorites('class', licenseKey, { trialId: 101 });

      // Verify trial 1 cleared, trial 2 still exists
      expect(parseFavoritesFromLocalStorage('class', licenseKey, { trialId: 101 })).toEqual([]);
      expect(parseFavoritesFromLocalStorage('class', licenseKey, { trialId: 102 })).toEqual([4, 5, 6]);
    });
  });
});
