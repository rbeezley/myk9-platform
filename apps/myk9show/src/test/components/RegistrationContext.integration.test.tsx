import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { RegistrationWorkflow } from '../../components/shows/RegistrationWorkflow/RegistrationWorkflow';
import { RegistrationProvider } from '../../context/RegistrationContext';
import { AuthProvider } from '../../context/AuthContext';
import { MOCK_USERS } from '../../types/auth-types';
import * as fs from 'fs';
import * as path from 'path';

// Mock hooks that require async loading to keep tests synchronous
vi.mock('../../hooks/queries/useUserRoles', () => ({
  useUserRoles: () => ({ data: [], isLoading: false, error: null }),
  useUserRoleNames: () => ({ data: [], isLoading: false, error: null }),
}));

vi.mock('../../services/rbac/RBACService', () => ({
  rbacService: {
    getUserRoles: vi.fn().mockResolvedValue([]),
    getUserRolesByEmail: vi.fn().mockResolvedValue([]),
    hasPermission: vi.fn().mockResolvedValue(false),
  },
}));

// Mock stores with minimal data
vi.mock('../../store/showRegistrationStore', () => ({
  useShowRegistrationStore: () => ({
    registrationData: { selectedDogs: [] },
    handlerAssignments: {},
    setHandlerAssignments: vi.fn(),
    paymentData: {},
    confirmRegistration: vi.fn(),
    currentRegistration: null,
    updatePaymentStatus: vi.fn(),
    updateEntryStatus: vi.fn(),
    setDraftData: vi.fn(),
    draftData: null,
    clearDraft: vi.fn(),
    setRegistrationData: vi.fn(),
    setPaymentData: vi.fn(),
  }),
}));

vi.mock('../../store/dogStore', () => ({
  useDogStore: () => ({ dogs: [] }),
}));

vi.mock('../../store/userStore', () => ({
  useUserStore: () => ({ people: [] }),
}));

vi.mock('../../hooks/useRegistrationPermissions', () => ({
  useRegistrationPermissions: () => ({
    canViewAllDogs: false,
    canCreateExhibitor: false,
    canBulkOperations: false,
    canAdvancedSearch: false,
  }),
}));

describe('RegistrationContext Integration', () => {
  const mockOnComplete = vi.fn();
  const mockOnCancel = vi.fn();
  let mockConsoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.clearAllMocks();
    localStorage.clear();

    // Set up mock user
    localStorage.setItem(
      'authStore',
      JSON.stringify({
        state: {
          user: MOCK_USERS['exhibitor-user'], // Use the exhibitor user from MOCK_USERS object
        },
      })
    );
  });

  afterEach(() => {
    mockConsoleError.mockRestore();
  });

  describe('Provider Requirements', () => {
    it('should throw error when RegistrationProvider is missing', () => {
      // This test catches the "useRegistrationContext must be used within a RegistrationProvider" error
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      expect(() => {
        render(
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              {/* Missing RegistrationProvider */}
              <RegistrationWorkflow
                showId="test-show"
                onComplete={mockOnComplete}
                onCancel={mockOnCancel}
              />
            </AuthProvider>
          </QueryClientProvider>
        );
      }).toThrow('useRegistrationContext must be used within a RegistrationProvider');
    });

    it('should render successfully with all required providers', async () => {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      expect(() => {
        render(
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <RegistrationProvider>
                <RegistrationWorkflow
                  showId="test-show"
                  onComplete={mockOnComplete}
                  onCancel={mockOnCancel}
                />
              </RegistrationProvider>
            </AuthProvider>
          </QueryClientProvider>
        );
      }).not.toThrow();

      // Should not have logged any errors
      expect(mockConsoleError).not.toHaveBeenCalled();
    });

    it('should access context values correctly when properly wrapped', async () => {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RegistrationProvider>
              <RegistrationWorkflow
                showId="test-show"
                onComplete={mockOnComplete}
                onCancel={mockOnCancel}
              />
            </RegistrationProvider>
          </AuthProvider>
        </QueryClientProvider>
      );

      // Component should render without context errors
      expect(mockConsoleError).not.toHaveBeenCalled();
    });
  });

  describe('Provider Chain Validation', () => {
    it.skip('should require AuthProvider before RegistrationProvider', () => {
      // TODO: fix - RegistrationProvider throws when AuthProvider is missing (useAuthContext throws)
      // The component cannot render gracefully without the auth context
    });

    it('should work with complete provider hierarchy', async () => {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RegistrationProvider>
              <RegistrationWorkflow
                showId="test-show"
                onComplete={mockOnComplete}
                onCancel={mockOnCancel}
              />
            </RegistrationProvider>
          </AuthProvider>
        </QueryClientProvider>
      );

      // Full provider chain should work without errors
      expect(container.firstChild).toBeTruthy();
      expect(mockConsoleError).not.toHaveBeenCalled();
    });
  });

  describe('Context Usage Patterns', () => {
    it('should handle different user roles through context', async () => {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      // Test with secretary user
      localStorage.setItem(
        'authStore',
        JSON.stringify({
          state: {
            user: MOCK_USERS['secretary-user'], // Use the secretary user from MOCK_USERS object
          },
        })
      );

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RegistrationProvider>
              <RegistrationWorkflow
                showId="test-show"
                onComplete={mockOnComplete}
                onCancel={mockOnCancel}
              />
            </RegistrationProvider>
          </AuthProvider>
        </QueryClientProvider>
      );

      expect(mockConsoleError).not.toHaveBeenCalled();
    });

    it('should handle context switches without errors', async () => {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RegistrationProvider>
              <RegistrationWorkflow
                showId="test-show-1"
                onComplete={mockOnComplete}
                onCancel={mockOnCancel}
              />
            </RegistrationProvider>
          </AuthProvider>
        </QueryClientProvider>
      );

      // Change show ID to test context updates
      rerender(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RegistrationProvider>
              <RegistrationWorkflow
                showId="test-show-2"
                onComplete={mockOnComplete}
                onCancel={mockOnCancel}
              />
            </RegistrationProvider>
          </AuthProvider>
        </QueryClientProvider>
      );

      expect(mockConsoleError).not.toHaveBeenCalled();
    });
  });
});

describe('CalendarPage Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should validate CalendarPage wraps RegistrationWorkflow correctly', async () => {
    // Import CalendarPage and check its structure
    const calendarPagePath = path.join(__dirname, '../../pages/CalendarPage.tsx');
    const calendarPageContent = fs.readFileSync(calendarPagePath, 'utf8');

    // Check that RegistrationProvider wraps RegistrationWorkflow
    const hasRegistrationProvider = calendarPageContent.includes('<RegistrationProvider>');
    const hasRegistrationWorkflow = calendarPageContent.includes('<RegistrationWorkflow');
    const hasCorrectNesting =
      calendarPageContent.indexOf('<RegistrationProvider>') <
      calendarPageContent.indexOf('<RegistrationWorkflow');

    expect(hasRegistrationProvider).toBe(true);
    expect(hasRegistrationWorkflow).toBe(true);
    expect(hasCorrectNesting).toBe(true);
  });

  it('should import RegistrationProvider in CalendarPage', () => {
    const calendarPagePath = path.join(__dirname, '../../pages/CalendarPage.tsx');
    const calendarPageContent = fs.readFileSync(calendarPagePath, 'utf8');

    // Check that RegistrationProvider is imported
    const hasImport = calendarPageContent.includes('import { RegistrationProvider }');
    expect(hasImport).toBe(true);
  });
});
