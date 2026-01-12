import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { logger } from '@/services/LoggingService';

// Global test setup for unit and integration tests

// Setup before all tests
beforeAll(() => {
  logger.debug('🧪 Starting test suite...', 'app', {});
  
  // Mock console methods to reduce noise during tests
  if (process.env.NODE_ENV === 'test') {
    const originalConsoleError = console.error;
    console.error = (message: string, ...args: unknown[]) => {
      // Suppress known React warnings in tests
      if (
        typeof message === 'string' &&
        (message.includes('Warning: ReactDOM.render is deprecated') ||
         message.includes('Warning: React.createFactory() is deprecated') ||
         message.includes('Warning: componentWillReceiveProps has been renamed'))
      ) {
        return;
      }
      originalConsoleError(message, ...args);
    };
  }
  
  // Setup global test environment
  setupGlobalMocks();
  setupTestHelpers();
});

// Cleanup after all tests
afterAll(() => {
  logger.debug('✅ Test suite completed', 'app', {});
  
  // Restore original implementations
  restoreGlobalMocks();
});

// Setup before each test
beforeEach(() => {
  // Reset all mocks to ensure test isolation
  vi.clearAllMocks();
  
  // Clear any localStorage/sessionStorage
  localStorage.clear();
  sessionStorage.clear();
  
  // Reset DOM state
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  
  // Reset performance timing
  if (typeof performance !== 'undefined' && performance.clearMarks) {
    performance.clearMarks();
    performance.clearMeasures();
  }
});

// Cleanup after each test
afterEach(() => {
  // Cleanup React Testing Library
  cleanup();
  
  // Clear any timers
  vi.clearAllTimers();
  
  // Reset fetch mocks
  if (global.fetch && (global.fetch as unknown as { mockClear?: () => void }).mockClear) {
    (global.fetch as unknown as { mockClear: () => void }).mockClear();
  }
});

// Global mock setup
function setupGlobalMocks() {
  // Mock window.matchMedia
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

  // Mock ResizeObserver
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));

  // Mock IntersectionObserver
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
    root: null,
    rootMargin: '',
    thresholds: [],
  }));

  // Mock PerformanceObserver
  global.PerformanceObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    disconnect: vi.fn(),
    takeRecords: vi.fn().mockReturnValue([]),
  }));

  // Mock performance API
  if (typeof performance === 'undefined') {
    global.performance = {
      now: vi.fn(() => Date.now()),
      mark: vi.fn(),
      measure: vi.fn(),
      clearMarks: vi.fn(),
      clearMeasures: vi.fn(),
      getEntriesByType: vi.fn().mockReturnValue([]),
      getEntriesByName: vi.fn().mockReturnValue([]),
      memory: {
        usedJSHeapSize: 10000000,
        totalJSHeapSize: 20000000,
        jsHeapSizeLimit: 50000000,
      },
    } as typeof performance;
  }

  // Mock navigator
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
      readText: vi.fn().mockResolvedValue(''),
    },
    writable: true,
  });

  Object.defineProperty(navigator, 'connection', {
    value: {
      effectiveType: '4g',
      downlink: 10,
      rtt: 50,
      saveData: false,
    },
    writable: true,
  });

  Object.defineProperty(navigator, 'onLine', {
    writable: true,
    value: true,
  });

  // Mock geolocation
  Object.defineProperty(navigator, 'geolocation', {
    value: {
      getCurrentPosition: vi.fn().mockImplementation((success) =>
        success({
          coords: {
            latitude: 39.7392,
            longitude: -104.9903,
            accuracy: 10,
          },
        })
      ),
      watchPosition: vi.fn(),
      clearWatch: vi.fn(),
    },
    writable: true,
  });

  // Mock fetch
  global.fetch = vi.fn().mockImplementation(() => {
    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
      blob: () => Promise.resolve(new Blob()),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      clone: () => ({ ...this }),
    } as Response);
  });

  // Mock URL.createObjectURL
  global.URL.createObjectURL = vi.fn(() => 'mock-url');
  global.URL.revokeObjectURL = vi.fn();

  // Mock WebSocket
  global.WebSocket = vi.fn().mockImplementation(() => ({
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    readyState: 1, // OPEN
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  }));

  // Mock IndexedDB
  const mockIDBRequest = {
    result: undefined,
    error: null,
    onsuccess: null,
    onerror: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  const mockIDBDatabase = {
    transaction: vi.fn().mockReturnValue({
      objectStore: vi.fn().mockReturnValue({
        add: vi.fn().mockReturnValue(mockIDBRequest),
        put: vi.fn().mockReturnValue(mockIDBRequest),
        get: vi.fn().mockReturnValue(mockIDBRequest),
        getAll: vi.fn().mockReturnValue(mockIDBRequest),
        delete: vi.fn().mockReturnValue(mockIDBRequest),
        clear: vi.fn().mockReturnValue(mockIDBRequest),
        createIndex: vi.fn(),
      }),
    }),
    close: vi.fn(),
  };

  global.indexedDB = {
    open: vi.fn().mockReturnValue({
      ...mockIDBRequest,
      result: mockIDBDatabase,
      onupgradeneeded: null,
    }),
    deleteDatabase: vi.fn().mockReturnValue(mockIDBRequest),
    databases: vi.fn().mockResolvedValue([]),
  } as typeof indexedDB;

  // Mock File and FileReader
  global.File = vi.fn().mockImplementation((parts, name, options) => ({
    name,
    size: parts.reduce((acc: number, part: unknown) => acc + ((part as { length?: number }).length || 0), 0),
    type: options?.type || '',
    lastModified: Date.now(),
    slice: vi.fn(),
    stream: vi.fn(),
    text: vi.fn().mockResolvedValue(''),
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
  }));

  global.FileReader = vi.fn().mockImplementation(() => ({
    readAsText: vi.fn(),
    readAsDataURL: vi.fn(),
    readAsArrayBuffer: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    result: null,
    error: null,
    onload: null,
    onerror: null,
  }));
}

function setupTestHelpers() {
  // Add custom test utilities to global scope
  (global as Record<string, unknown>).waitFor = async (callback: () => boolean, timeout = 5000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await callback()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timeout waiting for condition after ${timeout}ms`);
  };

  (global as Record<string, unknown>).createMockFile = (name: string, content: string, type = 'text/plain') => {
    return new File([content], name, { type });
  };

  (global as Record<string, unknown>).createMockEvent = (type: string, data = {}) => {
    return new CustomEvent(type, { detail: data });
  };
}

function restoreGlobalMocks() {
  // Restore any global mocks if needed
  vi.restoreAllMocks();
}

// Export test utilities
export const testUtils = {
  createMockUser: (role = 'exhibitor', overrides = {}) => ({
    id: `test-user-${Date.now()}`,
    email: `test-${role}@example.com`,
    name: `Test ${role}`,
    role,
    ...overrides,
  }),

  createMockShow: (overrides = {}) => ({
    id: `test-show-${Date.now()}`,
    name: 'Test Show',
    date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    location: 'Test Venue',
    status: 'upcoming',
    ...overrides,
  }),

  createMockEntry: (overrides = {}) => ({
    id: `test-entry-${Date.now()}`,
    showId: 'test-show-1',
    dogId: 'test-dog-1',
    status: 'pending',
    classes: [],
    totalFee: 50,
    submittedAt: new Date(),
    ...overrides,
  }),

  createMockNotification: (overrides = {}) => ({
    id: `test-notification-${Date.now()}`,
    type: 'notification',
    title: 'Test Notification',
    body: 'This is a test notification',
    priority: 'normal',
    category: 'entry_update',
    isRead: false,
    timestamp: new Date(),
    ...overrides,
  }),

  // Mock API responses
  mockApiResponse: (data: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  }),

  // Time helpers
  advanceTime: (ms: number) => {
    vi.advanceTimersByTime(ms);
  },

  // Storage helpers
  mockLocalStorage: (initialData: Record<string, unknown> = {}) => {
    const storage: Record<string, string> = {};
    
    Object.keys(initialData).forEach(key => {
      storage[key] = JSON.stringify(initialData[key]);
    });

    return {
      getItem: vi.fn((key: string) => storage[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        storage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete storage[key];
      }),
      clear: vi.fn(() => {
        Object.keys(storage).forEach(key => delete storage[key]);
      }),
    };
  },
};