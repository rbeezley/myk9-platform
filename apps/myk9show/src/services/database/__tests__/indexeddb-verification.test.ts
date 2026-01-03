// Simple verification test for IndexedDB integration
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';

// Setup fake IndexedDB for testing
const fakeIndexedDB = new FDBFactory();
Object.defineProperty(global, 'indexedDB', {
  value: fakeIndexedDB,
  writable: true
});
Object.defineProperty(global, 'IDBKeyRange', {
  value: FDBKeyRange,
  writable: true
});

// Setup window object for browser environment detection
Object.defineProperty(globalThis, 'window', {
  value: {
    indexedDB: fakeIndexedDB,
    IDBKeyRange: FDBKeyRange,
    IDBCursor: class IDBCursor {},
    IDBTransaction: class IDBTransaction {}
  },
  writable: true
});

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

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true
});

// Mock import.meta.env for IndexedDB enabled
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_ENABLE_INDEXEDDB: 'true',
    VITE_INDEXEDDB_VERSION: '1',
    VITE_ENABLE_STORAGE_LOGGING: 'false'
  },
  configurable: true
});

describe('IndexedDB Integration Verification', () => {
  beforeAll(() => {
    // Ensure IndexedDB globals are available
    expect(global.indexedDB).toBeDefined();
    expect(global.IDBKeyRange).toBeDefined();
  });

  afterEach(async () => {
    // Clean up any test databases
    try {
      const databases = await indexedDB.databases?.();
      if (databases) {
        for (const db of databases) {
          if (db.name?.startsWith('test-') || db.name === 'myK9ShowDB') {
            indexedDB.deleteDatabase(db.name);
          }
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should detect IndexedDB availability', async () => {
    const { isIndexedDBAvailable } = await import('../storage-adapter');
    expect(isIndexedDBAvailable()).toBe(true);
  });

  it('should create IndexedDB storage adapter', async () => {
    const { createIndexedDBStorage } = await import('../storage-adapter');
    const storage = createIndexedDBStorage();
    
    expect(storage).toBeDefined();
    expect(storage.getItem).toBeDefined();
    expect(storage.setItem).toBeDefined();
    expect(storage.removeItem).toBeDefined();
  });

  it('should create optimal storage with IndexedDB enabled', async () => {
    const { getOptimalStorage } = await import('../storage-adapter');
    const storage = getOptimalStorage('test-store');
    
    expect(storage).toBeDefined();
    expect(storage.getItem).toBeDefined();
    expect(storage.setItem).toBeDefined();
    expect(storage.removeItem).toBeDefined();
  });

  it('should import database schema without errors', async () => {
    const schema = await import('../schema');
    expect(schema.DATABASE_NAME).toBe('myK9ShowDB');
    expect(schema.DATABASE_VERSION).toBe(2); // Updated version in schema
    expect(schema.STORES).toBeDefined();
    expect(schema.generateDexieSchema).toBeDefined();
  });

  it('should generate valid Dexie schema', async () => {
    const { generateDexieSchema } = await import('../schema');
    const schema = generateDexieSchema();
    
    expect(schema).toBeDefined();
    expect(typeof schema).toBe('object');
    expect(schema.dogs).toContain('id');
    expect(schema.people).toContain('id');
    expect(schema.shows).toContain('id');
    expect(schema._zustand_state).toContain('id');
  });

  it('should perform basic storage operations', async () => {
    const { getOptimalStorage } = await import('../storage-adapter');
    const storage = getOptimalStorage('test-operations');
    
    // Test setItem and getItem
    await storage.setItem('test-key', 'test-value');
    const retrieved = await storage.getItem('test-key');
    expect(retrieved).toBe('test-value');
    
    // Test removeItem
    await storage.removeItem('test-key');
    const removed = await storage.getItem('test-key');
    expect(removed).toBeNull();
  });

  it('should handle JSON data correctly', async () => {
    const { getOptimalStorage, createIndexedDBStorage } = await import('../storage-adapter');
    
    // Test IndexedDB storage directly first
    const indexedDBStorage = createIndexedDBStorage();
    
    const testData = {
      id: '123',
      name: 'Test Dog',
      breed: 'Golden Retriever',
      nested: { value: 42, array: [1, 2, 3] }
    };
    
    const jsonString = JSON.stringify(testData);
    
    // Test direct IndexedDB storage
    await indexedDBStorage.setItem('direct-test', jsonString);
    const directRetrieved = await indexedDBStorage.getItem('direct-test');
    expect(directRetrieved).toBe(jsonString);
    
    // Test optimal storage
    const storage = getOptimalStorage('test-json');
    await storage.setItem('json-test', jsonString);
    
    const retrieved = await storage.getItem('json-test');
    // Since we're using hybrid storage, it should at least be in localStorage
    expect(retrieved).toBe(jsonString);
    
    const parsed = JSON.parse(retrieved!);
    expect(parsed).toEqual(testData);
  });

  it('should import migration utilities', async () => {
    const migration = await import('../migration');
    expect(migration.StorageMigration).toBeDefined();
    expect(migration.createMigrationService).toBeDefined();
  });

  it('should import database types', async () => {
    const types = await import('../types');
    expect(types).toBeDefined();
    // Check for type exports (they should be defined in TypeScript)
    expect(typeof types).toBe('object');
  });
});