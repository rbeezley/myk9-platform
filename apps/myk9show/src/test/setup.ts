import '@testing-library/jest-dom';
import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { testCleanup } from './config/testOptimization';
import { mockSupabase, resetMockSupabase } from './mocks/supabase';
import 'fake-indexeddb/auto';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBDatabase from 'fake-indexeddb/lib/FDBDatabase';
import FDBObjectStore from 'fake-indexeddb/lib/FDBObjectStore';
import FDBIndex from 'fake-indexeddb/lib/FDBIndex';
import FDBCursor from 'fake-indexeddb/lib/FDBCursor';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';
import FDBRequest from 'fake-indexeddb/lib/FDBRequest';
import FDBTransaction from 'fake-indexeddb/lib/FDBTransaction';

// Global Supabase mock — prevents any test from hitting the real API.
// Tests that need custom return data can import { mockSupabase, createChainableQuery }
// from '@/test/mocks/supabase' and call mockSupabase.from.mockReturnValue(...).
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: mockSupabase,
  default: mockSupabase,
  checkDatabaseConnection: vi.fn().mockResolvedValue({ connected: true, latency: 1 }),
  getCurrentUser: vi.fn().mockResolvedValue({ user: null, error: null }),
  signOut: vi.fn().mockResolvedValue({ error: null }),
  createRealtimeSubscription: vi.fn().mockReturnValue({
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  }),
  logQuery: vi.fn(),
  createDatabaseError: vi.fn((err: unknown, table?: string, operation?: string) => ({
    name: 'DatabaseError',
    message:
      err instanceof Error
        ? err.message
        : ((err as Record<string, unknown>)?.message ?? 'Database error'),
    code: err instanceof Error ? undefined : (err as Record<string, unknown>)?.code,
    details: err instanceof Error ? undefined : (err as Record<string, unknown>)?.details,
    table,
    operation,
  })),
  executeBatch: vi.fn().mockResolvedValue([]),
  getConnectionInfo: vi.fn().mockReturnValue({
    url: 'https://test.supabase.co',
    hasValidConfig: true,
    environment: 'test',
  }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: mockSupabase,
  default: mockSupabase,
}));

// canvas-confetti schedules requestAnimationFrame callbacks that keep firing
// after the triggering test finishes; in jsdom getContext('2d') returns null,
// so the async callback throws "Cannot read 'clearRect' of null" and crashes
// whichever test file vitest loads next in the same worker. Mock to a no-op.
vi.mock('canvas-confetti', () => {
  const confetti = Object.assign(vi.fn(), {
    reset: vi.fn(),
    create: vi.fn(() => vi.fn()),
  });
  return { default: confetti };
});

// @react-pdf/renderer needs fonts/buffers/PDF runtime that don't exist in JSDOM.
// All premium-PDF tests render templates to inspect their tree, so mock the
// primitives down to plain DOM. Tests that need richer behavior can override.
vi.mock('@react-pdf/renderer', async () => {
  const React = await import('react');
  const wrap =
    (tag: string, testId?: string) =>
    ({ children }: { children?: React.ReactNode }) =>
      React.createElement(tag, testId ? { 'data-testid': testId } : null, children);
  return {
    Document: wrap('div', 'pdf-document'),
    Page: wrap('div', 'pdf-page'),
    View: wrap('div'),
    Text: wrap('span'),
    Image: () => null,
    // Preserve `src` as `href` so URL assertions work without a custom mock.
    Link: ({ src, children }: { src?: string; children?: React.ReactNode }) =>
      React.createElement('a', { href: src }, children),
    StyleSheet: { create: (s: unknown) => s },
    Font: { register: vi.fn() },
  };
});

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

// Reset IndexedDB and Supabase mock before each test
beforeEach(() => {
  // Clear IndexedDB databases - fake-indexeddb uses a Map internally
  const db = globalThis.indexedDB as typeof FDBFactory.prototype & {
    _databases?: Map<string, unknown>;
  };
  if (db && db._databases) {
    db._databases.clear();
  }
  // Reset Supabase mock to defaults
  resetMockSupabase();
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

// Mock navigator.clipboard (not available in jsdom by default)
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue(''),
  },
  configurable: true,
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

// Mock IntersectionObserver — use a regular function (not arrow) so framer-motion can call it with `new`
global.IntersectionObserver = vi.fn().mockImplementation(function () {
  return {
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  };
});

// Mock ResizeObserver — use a regular function (not arrow) so @base-ui/react can call it with `new`
global.ResizeObserver = vi.fn().mockImplementation(function () {
  return {
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  };
});

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
