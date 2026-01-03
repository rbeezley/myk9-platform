/**
 * Unit Tests for Local Storage Utilities
 */

import {
  safeLocalStorageGet,
  safeLocalStorageSet,
  safeLocalStorageRemove,
  localStorageHas,
  getLocalStorageKeys
} from './localStorageUtils';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => {
      // Return null only if key doesn't exist, not if value is empty string
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

describe('localStorageUtils', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('safeLocalStorageGet', () => {
    describe('Basic functionality', () => {
      test('should return default value when key does not exist', () => {
        expect(safeLocalStorageGet('nonexistent', 'default')).toBe('default');
        expect(safeLocalStorageGet('missing', 42)).toBe(42);
        expect(safeLocalStorageGet('none', [])).toEqual([]);
      });

      test('should return parsed value when key exists', () => {
        localStorage.setItem('username', JSON.stringify('John'));
        expect(safeLocalStorageGet('username', 'Guest')).toBe('John');
      });

      test('should handle different data types', () => {
        // String
        localStorage.setItem('str', JSON.stringify('hello'));
        expect(safeLocalStorageGet('str', '')).toBe('hello');

        // Number
        localStorage.setItem('num', JSON.stringify(123));
        expect(safeLocalStorageGet('num', 0)).toBe(123);

        // Boolean
        localStorage.setItem('bool', JSON.stringify(true));
        expect(safeLocalStorageGet('bool', false)).toBe(true);

        // Array
        localStorage.setItem('arr', JSON.stringify([1, 2, 3]));
        expect(safeLocalStorageGet('arr', [])).toEqual([1, 2, 3]);

        // Object
        localStorage.setItem('obj', JSON.stringify({a: 1, b: 2}));
        expect(safeLocalStorageGet('obj', {})).toEqual({a: 1, b: 2});
      });
    });

    describe('Error handling', () => {
      test('should return default value on invalid JSON', () => {
        localStorage.setItem('invalid', 'not-json{]');
        expect(safeLocalStorageGet('invalid', 'default')).toBe('default');
      });

      test('should log error on invalid JSON', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        localStorage.setItem('bad', 'invalid-json');
        safeLocalStorageGet('bad', 'default');
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
      });
    });

    describe('Validation', () => {
      test('should use validator to check parsed value', () => {
        // Valid case
        localStorage.setItem('favorites', JSON.stringify([1, 2, 3]));
        const result = safeLocalStorageGet<number[]>(
          'favorites',
          [],
          (val) => Array.isArray(val) && val.every(id => typeof id === 'number')
        );
        expect(result).toEqual([1, 2, 3]);
      });

      test('should return default if validation fails', () => {
        // Invalid case - array of strings instead of numbers
        localStorage.setItem('favorites', JSON.stringify(['a', 'b']));
        const result = safeLocalStorageGet<number[]>(
          'favorites',
          [],
          (val) => Array.isArray(val) && val.every(id => typeof id === 'number')
        );
        expect(result).toEqual([]);
      });

      test('should log warning when validation fails', () => {
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        localStorage.setItem('invalid-type', JSON.stringify('string'));
        safeLocalStorageGet<number>(
          'invalid-type',
          0,
          (val) => typeof val === 'number'
        );
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Invalid data for key "invalid-type"')
        );
        consoleSpy.mockRestore();
      });

      test('should handle complex object validation', () => {
        interface Config {
          theme: string;
          notifications: boolean;
        }

        localStorage.setItem('config', JSON.stringify({theme: 'dark', notifications: true}));
        const result = safeLocalStorageGet<Config>(
          'config',
          {theme: 'light', notifications: false},
          (val) => typeof val === 'object' && 'theme' in val && 'notifications' in val
        );
        expect(result).toEqual({theme: 'dark', notifications: true});
      });
    });
  });

  describe('safeLocalStorageSet', () => {
    describe('Basic functionality', () => {
      test('should save string value', () => {
        const success = safeLocalStorageSet('key', 'value');
        expect(success).toBe(true);
        expect(localStorage.getItem('key')).toBe(JSON.stringify('value'));
      });

      test('should save number value', () => {
        safeLocalStorageSet('count', 42);
        expect(JSON.parse(localStorage.getItem('count')!)).toBe(42);
      });

      test('should save boolean value', () => {
        safeLocalStorageSet('flag', true);
        expect(JSON.parse(localStorage.getItem('flag')!)).toBe(true);
      });

      test('should save array', () => {
        safeLocalStorageSet('items', [1, 2, 3]);
        expect(JSON.parse(localStorage.getItem('items')!)).toEqual([1, 2, 3]);
      });

      test('should save object', () => {
        safeLocalStorageSet('user', {name: 'John', id: 123});
        expect(JSON.parse(localStorage.getItem('user')!)).toEqual({name: 'John', id: 123});
      });

      test('should overwrite existing key', () => {
        safeLocalStorageSet('key', 'old');
        safeLocalStorageSet('key', 'new');
        expect(JSON.parse(localStorage.getItem('key')!)).toBe('new');
      });
    });

    describe('Error handling', () => {
      test('should return false on serialization error', () => {
        const circular: any = {};
        circular.self = circular; // Circular reference

        const success = safeLocalStorageSet('circular', circular);
        expect(success).toBe(false);
      });

      test('should log error on serialization error', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const circular: any = {};
        circular.self = circular;

        safeLocalStorageSet('circular', circular);
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
      });

      test('should handle quota exceeded error gracefully', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        // Mock setItem to throw QuotaExceededError
        const originalSetItem = localStorageMock.setItem;
        localStorageMock.setItem = vi.fn(() => {
          const error = new DOMException('', 'QuotaExceededError');
          throw error;
        });

        const success = safeLocalStorageSet('large', 'data');
        expect(success).toBe(false);
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('quota exceeded')
        );

        // Restore
        localStorageMock.setItem = originalSetItem;
        consoleSpy.mockRestore();
      });
    });
  });

  describe('safeLocalStorageRemove', () => {
    test('should remove existing key', () => {
      localStorage.setItem('temp', 'value');
      expect(localStorage.getItem('temp')).toBe('value');

      const success = safeLocalStorageRemove('temp');
      expect(success).toBe(true);
      expect(localStorage.getItem('temp')).toBeNull();
    });

    test('should return true when key does not exist', () => {
      const success = safeLocalStorageRemove('nonexistent');
      expect(success).toBe(true);
    });

    test('should handle errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock removeItem to throw error
      const originalRemoveItem = localStorageMock.removeItem;
      localStorageMock.removeItem = vi.fn(() => {
        throw new Error('Remove failed');
      });

      const success = safeLocalStorageRemove('key');
      expect(success).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();

      // Restore
      localStorageMock.removeItem = originalRemoveItem;
      consoleSpy.mockRestore();
    });
  });

  describe('localStorageHas', () => {
    test('should return true when key exists', () => {
      localStorageMock.setItem('exists', 'value');
      expect(localStorageHas('exists')).toBe(true);
    });

    test('should return false when key does not exist', () => {
      expect(localStorageHas('missing')).toBe(false);
    });

    test('should return true even if value is empty string', () => {
      localStorageMock.setItem('empty', '');
      expect(localStorageHas('empty')).toBe(true);
    });

    test('should handle errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock getItem to throw error
      const originalGetItem = localStorageMock.getItem;
      localStorageMock.getItem = vi.fn(() => {
        throw new Error('Get failed');
      });

      const result = localStorageHas('key');
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();

      // Restore
      localStorageMock.getItem = originalGetItem;
      consoleSpy.mockRestore();
    });
  });

  describe('getLocalStorageKeys', () => {
    test('should return empty array when no keys match', () => {
      localStorage.setItem('other_key', 'value');
      expect(getLocalStorageKeys('favorites_')).toEqual([]);
    });

    test('should return all keys matching prefix', () => {
      localStorage.setItem('favorites_123', 'a');
      localStorage.setItem('favorites_456', 'b');
      localStorage.setItem('favorites_789', 'c');
      localStorage.setItem('other_key', 'd');

      const keys = getLocalStorageKeys('favorites_');
      expect(keys).toHaveLength(3);
      expect(keys).toContain('favorites_123');
      expect(keys).toContain('favorites_456');
      expect(keys).toContain('favorites_789');
      expect(keys).not.toContain('other_key');
    });

    test('should handle empty localStorage', () => {
      expect(getLocalStorageKeys('any_')).toEqual([]);
    });

    test('should handle errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Add some items to trigger the loop
      localStorageMock.setItem('prefix_1', 'value1');
      localStorageMock.setItem('prefix_2', 'value2');

      // Mock key() to throw error
      const originalKey = localStorageMock.key;
      localStorageMock.key = vi.fn(() => {
        throw new Error('Key access failed');
      });

      const keys = getLocalStorageKeys('prefix_');
      expect(keys).toEqual([]);
      expect(consoleSpy).toHaveBeenCalled();

      // Restore
      localStorageMock.key = originalKey;
      consoleSpy.mockRestore();
    });
  });

  describe('Real-world scenarios', () => {
    test('should handle favorites workflow (Settings.tsx pattern)', () => {
      const licenseKey = 'ABC123';
      const favoritesKey = `dog_favorites_${licenseKey}`;

      // Load (doesn't exist yet)
      const initial = safeLocalStorageGet<number[]>(
        favoritesKey,
        [],
        (val) => Array.isArray(val) && val.every(id => typeof id === 'number')
      );
      expect(initial).toEqual([]);

      // Save
      const success = safeLocalStorageSet(favoritesKey, [101, 202, 303]);
      expect(success).toBe(true);

      // Load again
      const loaded = safeLocalStorageGet<number[]>(
        favoritesKey,
        [],
        (val) => Array.isArray(val) && val.every(id => typeof id === 'number')
      );
      expect(loaded).toEqual([101, 202, 303]);
    });

    test('should handle notification config workflow (notificationService.ts pattern)', () => {
      const configKey = 'quiet_hours_config';
      interface QuietHours {
        enabled: boolean;
        start: string;
        end: string;
      }

      // Load default
      const config = safeLocalStorageGet<QuietHours>(
        configKey,
        {enabled: false, start: '22:00', end: '08:00'},
        (val) => typeof val === 'object' && 'enabled' in val
      );
      expect(config.enabled).toBe(false);

      // Save custom
      safeLocalStorageSet(configKey, {enabled: true, start: '23:00', end: '07:00'});

      // Reload
      const updated = safeLocalStorageGet<QuietHours>(
        configKey,
        {enabled: false, start: '22:00', end: '08:00'},
        (val) => typeof val === 'object' && 'enabled' in val
      );
      expect(updated).toEqual({enabled: true, start: '23:00', end: '07:00'});
    });

    test('should handle cleanup of multiple favorites keys', () => {
      // Create multiple favorites keys
      safeLocalStorageSet('favorites_show1_trial1', [1, 2, 3]);
      safeLocalStorageSet('favorites_show1_trial2', [4, 5, 6]);
      safeLocalStorageSet('favorites_show2_trial1', [7, 8, 9]);
      safeLocalStorageSet('other_data', 'keep this');

      // Find all favorites keys
      const favoriteKeys = getLocalStorageKeys('favorites_');
      expect(favoriteKeys).toHaveLength(3);

      // Remove all favorites
      favoriteKeys.forEach(key => safeLocalStorageRemove(key));

      // Verify cleanup
      expect(getLocalStorageKeys('favorites_')).toHaveLength(0);
      expect(localStorageHas('other_data')).toBe(true);
    });
  });
});
