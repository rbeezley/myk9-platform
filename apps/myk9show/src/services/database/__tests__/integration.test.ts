// Integration tests for Phase 2 store migrations
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';

// Setup fake IndexedDB for testing
global.indexedDB = new FDBFactory();
global.IDBKeyRange = FDBKeyRange;

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] || null
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock import.meta.env
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_ENABLE_INDEXEDDB: 'false', // Test localStorage fallback first
    VITE_INDEXEDDB_VERSION: '1',
    VITE_ENABLE_STORAGE_LOGGING: 'true'
  }
});

describe('Phase 2 Store Integration', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  describe('Storage Adapter', () => {
    it('should import storage adapter functions', async () => {
      const adapter = await import('../storage-adapter');
      expect(adapter.getOptimalStorage).toBeDefined();
      expect(adapter.createIndexedDBStorage).toBeDefined();
      expect(adapter.createHybridStorage).toBeDefined();
      expect(adapter.isIndexedDBAvailable).toBeDefined();
    });

    it('should detect IndexedDB availability', async () => {
      const { isIndexedDBAvailable } = await import('../storage-adapter');
      const isAvailable = isIndexedDBAvailable();
      expect(typeof isAvailable).toBe('boolean');
    });

    it('should create appropriate storage based on feature flags', async () => {
      const { getOptimalStorage } = await import('../storage-adapter');
      const storage = getOptimalStorage('test');
      
      expect(storage).toBeDefined();
      expect(storage.getItem).toBeDefined();
      expect(storage.setItem).toBeDefined();
      expect(storage.removeItem).toBeDefined();
    });
  });

  describe('Store Imports', () => {
    it('should import updated userStore', async () => {
      // This should not throw since we're using localStorage fallback
      const userStore = await import('@/store/userStore');
      expect(userStore.useUserStore).toBeDefined();
    });

    it('should import updated clubStore', async () => {
      const clubStore = await import('@/store/clubStore');
      expect(clubStore.useClubStore).toBeDefined();
    });

    it('should import updated dogStore', async () => {
      const dogStore = await import('@/store/dogStore');
      expect(dogStore.useDogStore).toBeDefined();
    });

    it('should import updated showStore', async () => {
      const showStore = await import('@/store/showStore');
      expect(showStore.useShowStore).toBeDefined();
    });
  });

  describe('Storage Operations', () => {
    it('should handle storage operations without errors', async () => {
      const { getOptimalStorage } = await import('../storage-adapter');
      const storage = getOptimalStorage('test');
      
      // Test storage operations
      await storage.setItem('test-key', 'test-value');
      const value = await storage.getItem('test-key');
      expect(value).toBe('test-value');
      
      await storage.removeItem('test-key');
      const removedValue = await storage.getItem('test-key');
      expect(removedValue).toBeNull();
    });

    it('should handle JSON serialization correctly', async () => {
      const { getOptimalStorage } = await import('../storage-adapter');
      const storage = getOptimalStorage('test');
      
      const testData = {
        id: '1',
        name: 'Test',
        nested: { value: 42 }
      };
      
      await storage.setItem('json-test', JSON.stringify(testData));
      const retrieved = await storage.getItem('json-test');
      expect(JSON.parse(retrieved!)).toEqual(testData);
    });
  });

  describe('Feature Flag Behavior', () => {
    it('should use localStorage when IndexedDB is disabled', async () => {
      // Feature flag is set to false in setup
      const { getOptimalStorage } = await import('../storage-adapter');
      const storage = getOptimalStorage('test');
      
      await storage.setItem('flag-test', 'localStorage-mode');
      
      // Should be stored in localStorage
      expect(localStorageMock.getItem('flag-test')).toBe('localStorage-mode');
    });
  });
});

describe('Phase 2 Migration Readiness', () => {
  it('should have all core stores ready for migration', async () => {
    // Test that all imports work without throwing
    const stores = await Promise.all([
      import('@/store/userStore'),
      import('@/store/clubStore'), 
      import('@/store/dogStore'),
      import('@/store/showStore')
    ]);
    
    expect(stores).toHaveLength(4);
    stores.forEach(store => {
      expect(store).toBeDefined();
    });
  });

  it('should have migration infrastructure ready', async () => {
    const [migration, adapter, connection] = await Promise.all([
      import('../migration'),
      import('../storage-adapter'),
      import('../connection')
    ]);
    
    expect(migration.StorageMigration).toBeDefined();
    expect(migration.createMigrationService).toBeDefined();
    expect(adapter.getOptimalStorage).toBeDefined();
    expect(connection.createDatabase).toBeDefined();
  });
});