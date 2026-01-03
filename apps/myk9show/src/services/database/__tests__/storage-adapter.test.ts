// Test storage adapter with a working database
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
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

describe('Storage Adapter Test', () => {
  let dbService: {
    syncEntities: (entities: unknown[]) => Promise<void>;
    getEntities: (type: string) => Promise<unknown[]>;
    clearData: () => Promise<void>;
  };

  beforeAll(async () => {
    const { createDatabase } = await import('../connection');
    dbService = createDatabase();
    await dbService.open();
  });

  afterAll(async () => {
    if (dbService) {
      await dbService.close();
    }
  });

  it('should perform storage operations via the storage adapter', async () => {
    const { createIndexedDBStorage } = await import('../storage-adapter');
    const storage = createIndexedDBStorage();

    // Test setItem
    await storage.setItem('adapter-test', 'test-value');

    // Test getItem
    const retrieved = await storage.getItem('adapter-test');
    expect(retrieved).toBe('test-value');

    // Test removeItem
    await storage.removeItem('adapter-test');
    const removed = await storage.getItem('adapter-test');
    expect(removed).toBeNull();
  });

  it('should work with JSON data', async () => {
    const { createIndexedDBStorage } = await import('../storage-adapter');
    const storage = createIndexedDBStorage();

    const testData = {
      id: '123',
      name: 'Test Dog',
      breed: 'Golden Retriever'
    };

    const jsonString = JSON.stringify(testData);

    // Store JSON data
    await storage.setItem('json-adapter-test', jsonString);

    // Retrieve JSON data
    const retrieved = await storage.getItem('json-adapter-test');
    expect(retrieved).toBe(jsonString);

    const parsed = JSON.parse(retrieved!);
    expect(parsed).toEqual(testData);
  });

  it('should use optimal storage correctly', async () => {
    const { getOptimalStorage } = await import('../storage-adapter');
    const storage = getOptimalStorage('optimal-test');

    // This should use hybrid storage with IndexedDB + localStorage fallback
    await storage.setItem('optimal-key', 'optimal-value');
    const retrieved = await storage.getItem('optimal-key');
    
    // Should work either via IndexedDB or localStorage fallback
    expect(retrieved).toBe('optimal-value');
  });

  it('should detect IndexedDB availability correctly', async () => {
    const { isIndexedDBAvailable } = await import('../storage-adapter');
    expect(isIndexedDBAvailable()).toBe(true);
  });
});