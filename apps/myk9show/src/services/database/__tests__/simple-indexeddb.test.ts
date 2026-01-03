// Simple test to debug IndexedDB integration
import { describe, it, expect, beforeAll } from 'vitest';
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

describe('Simple IndexedDB Test', () => {
  beforeAll(() => {
    // Ensure globals are available
    expect(global.indexedDB).toBeDefined();
    expect(globalThis.window?.indexedDB).toBeDefined();
  });

  it('should create and use a simple database', async () => {
    // Create a simple database directly
    const dbName = 'test-db';
    const request = indexedDB.open(dbName, 1);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const store = db.createObjectStore('testStore', { keyPath: 'id' });
      store.createIndex('id', 'id', { unique: true });
    };

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    expect(db).toBeDefined();
    expect(db.name).toBe(dbName);

    // Test basic operations
    const transaction = db.transaction(['testStore'], 'readwrite');
    const store = transaction.objectStore('testStore');
    
    // Add data
    const testData = { id: 'test1', value: 'Hello World' };
    await new Promise<void>((resolve, reject) => {
      const addRequest = store.add(testData);
      addRequest.onsuccess = () => resolve();
      addRequest.onerror = () => reject(addRequest.error);
    });

    // Read data
    const retrieved = await new Promise<unknown>((resolve, reject) => {
      const getRequest = store.get('test1');
      getRequest.onsuccess = () => resolve(getRequest.result);
      getRequest.onerror = () => reject(getRequest.error);
    });

    expect(retrieved).toEqual(testData);
    
    db.close();
  });

  it('should test database service', async () => {
    const { createDatabase } = await import('../connection');
    const dbService = createDatabase();

    expect(dbService).toBeDefined();
    expect(dbService.dogs).toBeDefined();
    expect(dbService._zustand_state).toBeDefined();

    // Try to open the database
    await dbService.open();

    // Test basic operations
    const testRecord = {
      id: 'test-record-1',
      state: JSON.stringify({ test: 'data' }),
      lastModified: new Date()
    };

    // This should create the record
    await dbService._zustand_state.add(testRecord);

    // This should retrieve the record
    const retrieved = await dbService._zustand_state.get('test-record-1');
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe('test-record-1');
    expect(retrieved?.state).toBe(testRecord.state);

    await dbService.close();
  });
});