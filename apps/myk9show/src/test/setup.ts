import '@testing-library/jest-dom';
import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { testCleanup } from './config/testOptimization';
import 'fake-indexeddb/auto';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBDatabase from 'fake-indexeddb/lib/FDBDatabase';
import FDBObjectStore from 'fake-indexeddb/lib/FDBObjectStore';
import FDBIndex from 'fake-indexeddb/lib/FDBIndex';
import FDBCursor from 'fake-indexeddb/lib/FDBCursor';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';
import FDBRequest from 'fake-indexeddb/lib/FDBRequest';
import FDBTransaction from 'fake-indexeddb/lib/FDBTransaction';

// Setup IndexedDB mocking
globalThis.indexedDB = new FDBFactory();
globalThis.IDBDatabase = FDBDatabase;
globalThis.IDBObjectStore = FDBObjectStore;
globalThis.IDBIndex = FDBIndex;
globalThis.IDBCursor = FDBCursor;
globalThis.IDBKeyRange = FDBKeyRange;
globalThis.IDBRequest = FDBRequest;
globalThis.IDBTransaction = FDBTransaction;

// Cleanup after each test case with optimizations
afterEach(() => {
  cleanup();
  testCleanup.cleanup(); // Enhanced cleanup with render loop detection
});

// Reset IndexedDB before each test
beforeEach(() => {
  // Clear IndexedDB databases - fake-indexeddb uses a Map internally
  const db = globalThis.indexedDB as typeof FDBFactory.prototype & { _databases?: Map<string, unknown> };
  if (db && db._databases) {
    db._databases.clear();
  }
});

// Mock localStorage with proper storage behavior
const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageStore[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageStore[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageStore[key];
  }),
  clear: vi.fn(() => {
    Object.keys(localStorageStore).forEach(key => delete localStorageStore[key]);
  }),
  get length() {
    return Object.keys(localStorageStore).length;
  },
  key: vi.fn((index: number) => {
    const keys = Object.keys(localStorageStore);
    return keys[index] || null;
  }),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock console methods to reduce noise in tests
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// Mock theme provider
vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => ({
    theme: 'light',
    setTheme: vi.fn(),
  }),
}));