/**
 * Test setup file for Vitest
 */

import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Note: vi.mock() calls in setup files cause all tests to fail
// Each test file that needs mocks must add them individually

// Mock window.matchMedia (for dark mode detection)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
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

// Mock navigator.onLine (make it configurable so tests can override it)
Object.defineProperty(navigator, 'onLine', {
  writable: true,
  configurable: true,
  value: true,
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock sessionStorage  
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock
});

// Mock window.addEventListener for online/offline events
const originalAddEventListener = window.addEventListener.bind(window);
window.addEventListener = vi.fn((event: string, handler: any) => {
  if (event === 'online' || event === 'offline') {
    // Mock implementation for network events
    return;
  }
  return originalAddEventListener(event as any, handler);
}) as any;

// Setup IndexedDB polyfill for replication system tests
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

// Provide a real IndexedDB implementation for tests
if (typeof globalThis.indexedDB === 'undefined') {
  globalThis.indexedDB = new IDBFactory();
}

// Also set it on window for browser-like environment
Object.defineProperty(window, 'indexedDB', {
  writable: true,
  configurable: true,
  value: globalThis.indexedDB,
});