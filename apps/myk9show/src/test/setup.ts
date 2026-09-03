import '@testing-library/jest-dom';
import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { testCleanup } from './config/testOptimization';
import { mockSupabase, resetMockSupabase } from './mocks/supabase';
import { createDatabaseError } from '@/services/database/databaseError';
import { resetAllStores } from './mocks/zustandReset';
import { createSupabaseNetworkGuard } from './supabaseNetworkGuard';
import 'fake-indexeddb/auto';
import {
  IDBFactory as FDBFactory,
  IDBDatabase as FDBDatabase,
  IDBObjectStore as FDBObjectStore,
  IDBIndex as FDBIndex,
  IDBCursor as FDBCursor,
  IDBKeyRange as FDBKeyRange,
  IDBRequest as FDBRequest,
  IDBTransaction as FDBTransaction,
} from 'fake-indexeddb';

// Global Supabase mock — prevents any test from hitting the real API.
// Tests that need custom return data can import { mockSupabase, createChainableQuery }
// from '@/test/mocks/supabase' and call mockSupabase.from.mockReturnValue(...).
//
// `createDatabaseError` is the REAL implementation, not a stand-in. Only the
// client and its network-touching helpers are faked here; error shaping is pure,
// so a copy would only add a way for the suite to disagree with production. It
// did: the previous copy returned `code: undefined` for `Error` inputs, which
// both reddened tests over correct code and hid genuine code-propagation gaps
// (MYK9-177). It imports from `@/services/database/databaseError` rather than
// this module's own path so pulling it in does not construct a Supabase client.
// Keep it that way — do not re-inline an implementation here.
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: mockSupabase,
  default: mockSupabase,
  signOut: vi.fn().mockResolvedValue({ error: null }),
  logQuery: vi.fn(),
  createDatabaseError,
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

// Defense in depth: module mocks are the normal test seam, but a direct
// createClient()/fetch path must never escape an ordinary Vitest worker to the
// shared hosted project. Dedicated Playwright/load processes do not load this
// setup file and retain their explicit remote-target approval gates. Tests that
// replace global fetch must delegate through or reinstall this guard; restoring
// the original global fetch would remove the isolation boundary for that file.
globalThis.fetch = createSupabaseNetworkGuard(globalThis.fetch.bind(globalThis));

// Zustand stores are module-level singletons whose in-memory state survives
// between tests. Route every store through the test mock so resetAllStores()
// (called in the beforeEach below) can snap each one back to its initial state,
// making the suite order-independent under --sequence.shuffle.
vi.mock('zustand', () => import('./mocks/zustand'));

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
  // Clear the module-level localStorage backing store. Zustand `persist`
  // middleware writes here, and without this reset a persisted store from
  // one test file (e.g. settings/cart/draft stores) leaks into the next
  // under shuffled suite order — rehydrating stale state and flipping
  // render gates in unrelated tests. Clearing the backing object (rather
  // than calling localStorage.clear()) also wipes the spy-call history so
  // assertions on setItem/removeItem don't see prior tests' calls.
  Object.keys(localStorageStore).forEach(key => delete localStorageStore[key]);
  // Snap every Zustand store back to its initial state so a store populated by
  // a prior test can't leak rows/flags into the next under shuffled order.
  resetAllStores();
  // Reset Supabase mock to defaults
  resetMockSupabase();
});

// Mock localStorage with proper storage behavior. The beforeEach above closes
// over this backing store; that closure body runs per-test (long after module
// init), so referencing this const before its textual declaration is safe.
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

// The suite's default environment is jsdom, but a file may opt out with
// `@vitest-environment node` — edge-function tests do, because they cover code
// that runs under Deno and jsdom's own `ArrayBuffer` makes WebCrypto reject
// buffers built in test code. This setup file runs for those too, so the
// browser-shaped stubs below have to be skipped rather than throw on `window`.
const hasDom = typeof window !== 'undefined';

if (hasDom) {
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
}

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
