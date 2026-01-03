import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Supabase
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ 
        data: { subscription: { unsubscribe: vi.fn() } }
      })
    }
  }
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe('Application Smoke Tests', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    
    // Set up basic mock data
    localStorage.setItem('dogStore', JSON.stringify({
      state: {
        dogs: [
          {
            id: 'dog-1',
            callName: 'Buddy',
            registeredName: 'Champion Buddy',
            gender: 'Male',
            birthDate: '2020-01-15',
            ownerId: 'owner-1',
            registrations: [{
              id: 'reg-1',
              organization: 'AKC',
              registeredName: 'Champion Buddy',
              breed: 'Golden Retriever',
              registrationNumber: 'AKC123456',
              status: 'Active'
            }]
          }
        ],
        people: [
          {
            id: 'owner-1',
            firstName: 'John',
            lastName: 'Smith',
            email: 'john@example.com'
          }
        ]
      }
    }));
    
    localStorage.setItem('showStore', JSON.stringify({
      state: {
        shows: [
          {
            id: 'show-1',
            name: 'Test Dog Show',
            startDate: '2025-03-01',
            status: 'accepting_entries'
          }
        ]
      }
    }));
  });

  it('should have basic application imports working', async () => {
    // Test that core modules can be imported without errors
    const { useDogStore } = await import('../../store/dogStore');
    const { useShowStore } = await import('../../store/showStore');
    
    expect(useDogStore).toBeDefined();
    expect(useShowStore).toBeDefined();
  });

  it('should handle localStorage state management', () => {
    // Test localStorage functionality
    const testData = { test: 'value' };
    localStorage.setItem('test-key', JSON.stringify(testData));
    
    const retrieved = JSON.parse(localStorage.getItem('test-key') || '{}');
    expect(retrieved.test).toBe('value');
  });

  it('should load and parse store data from localStorage', async () => {
    // Test that stores can handle the mock data
    const { useDogStore } = await import('../../store/dogStore');
    
    // Store should exist and have methods
    expect(typeof useDogStore.getState).toBe('function');
    expect(typeof useDogStore.setState).toBe('function');
    
    // Test basic store functionality
    const initialState = useDogStore.getState();
    expect(initialState).toBeDefined();
  });

  it('should handle error scenarios gracefully', () => {
    // Test corrupt localStorage data
    localStorage.setItem('dogStore', 'invalid-json');
    
    // This should not throw an error
    expect(() => {
      try {
        JSON.parse(localStorage.getItem('dogStore') || '{}');
      } catch {
        // Graceful handling of invalid JSON
        return {};
      }
    }).not.toThrow();
  });

  it('should validate core utility functions', async () => {
    // Test that utility functions work
    const { formatDate } = await import('../../lib/utils');
    
    const testDate = new Date('2025-01-01');
    const formatted = formatDate(testDate);
    
    expect(typeof formatted).toBe('string');
    expect(formatted.length).toBeGreaterThan(0);
  });

  it('should handle network client functionality', async () => {
    // Test NetworkClient from our production polish implementation
    const { NetworkClient } = await import('../../lib/networkUtils');
    
    const client = new NetworkClient({
      timeout: 1000,
      retryConfig: { maxRetries: 1 }
    });
    
    expect(client).toBeDefined();
    expect(typeof client.fetch).toBe('function');
  });

  it('should validate error boundary utilities', async () => {
    // Test ErrorBoundary utilities
    const { ErrorLogger } = await import('../../lib/networkUtils');
    
    const logger = new ErrorLogger();
    
    // Should handle error logging without throwing
    expect(() => {
      logger.logError(new Error('Test error'), {
        context: 'test',
        level: 'component'
      });
    }).not.toThrow();
  });

  it('should validate search cache functionality', async () => {
    // Test search cache utilities
    const { createSearchCache } = await import('../../lib/searchCache');
    
    const cache = createSearchCache({
      maxSize: 100,
      ttl: 5 * 60 * 1000 // 5 minutes
    });
    
    expect(cache).toBeDefined();
    expect(typeof cache.get).toBe('function');
    expect(typeof cache.set).toBe('function');
  });

  it('should validate recent searches functionality', async () => {
    // Test recent searches hook
    const { useRecentSearches } = await import('../../hooks/useRecentSearches');
    
    expect(useRecentSearches).toBeDefined();
    expect(typeof useRecentSearches).toBe('function');
  });

  it('should validate registration store functionality', async () => {
    // Test show registration store
    const { useShowRegistrationStore } = await import('../../store/showRegistrationStore');
    
    expect(useShowRegistrationStore).toBeDefined();
    expect(typeof useShowRegistrationStore).toBe('function');
  });

  it('should validate armband store functionality', async () => {
    // Test armband store
    const { useArmbandStore } = await import('../../store/armbandStore');
    
    expect(useArmbandStore).toBeDefined();
    expect(typeof useArmbandStore).toBe('function');
  });

  it('should validate RBAC types and utilities', async () => {
    // Test auth types
    const authTypes = await import('../../types/auth-types');
    
    expect(authTypes.UserRole).toBeDefined();
    expect(authTypes.PERMISSIONS).toBeDefined();
    expect(authTypes.MOCK_USERS).toBeDefined();
  });

  it('should validate registration types', async () => {
    // Test registration types
    const regTypes = await import('../../types/show-registration-types');
    
    expect(regTypes.EntryStatus).toBeDefined();
    expect(regTypes.PaymentStatus).toBeDefined();
  });

  it('should validate handler validation utilities', async () => {
    // Test handler validation
    const { validateHandlerEligibility } = await import('../../lib/handlerValidation');
    
    expect(validateHandlerEligibility).toBeDefined();
    expect(typeof validateHandlerEligibility).toBe('function');
  });

  it('should validate armband utilities', async () => {
    // Test armband utilities
    const { assignArmbands } = await import('../../lib/armbandUtils');
    
    expect(assignArmbands).toBeDefined();
    expect(typeof assignArmbands).toBe('function');
  });

  it('should pass production polish feature validation', async () => {
    // Validate that all production polish features are properly exported
    
    // Error Boundaries
    const errorBoundary = await import('../../components/common/ErrorBoundary');
    expect(errorBoundary.ErrorBoundary).toBeDefined();
    expect(errorBoundary.withErrorBoundary).toBeDefined();
    
    // Network Utils
    const networkUtils = await import('../../lib/networkUtils');
    expect(networkUtils.NetworkClient).toBeDefined();
    expect(networkUtils.useNetworkRequest).toBeDefined();
    
    // Search Cache
    const searchCache = await import('../../lib/searchCache');
    expect(searchCache.createSearchCache).toBeDefined();
    
    // Recent Searches
    const recentSearches = await import('../../hooks/useRecentSearches');
    expect(recentSearches.useRecentSearches).toBeDefined();
  });
});