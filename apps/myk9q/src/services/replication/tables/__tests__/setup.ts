/**
 * Test setup for replication tests
 * Uses real IndexedDB implementation (fake-indexeddb) instead of mocks
 */

import { vi } from 'vitest';
import fakeIndexedDB from 'fake-indexeddb';

// Override the mocked IndexedDB from global setup with real implementation
(global as any).indexedDB = fakeIndexedDB;

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          gt: vi.fn(() => ({
            order: vi.fn(() => ({
              data: [],
              error: null,
            })),
          })),
        })),
      })),
    })),
  },
}));

// Mock logger to reduce noise
vi.mock('@/utils/logger', () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock crypto.randomUUID for stable user ID generation
Object.defineProperty(global.crypto, 'randomUUID', {
  value: () => 'test-uuid-1234-5678-90ab-cdef',
  writable: true,
});
