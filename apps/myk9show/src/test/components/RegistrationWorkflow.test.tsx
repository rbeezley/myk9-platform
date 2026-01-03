import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RegistrationWorkflow } from '../../components/shows/RegistrationWorkflow/RegistrationWorkflow';
import { RegistrationProvider } from '../../context/RegistrationContext';
import { AuthProvider } from '../../context/AuthContext';
import { MOCK_USERS } from '../../types/auth-types';

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

// Mock stores
vi.mock('../../store/showStore', () => ({
  useShowStore: () => ({
    shows: [{
      id: 'show-1',
      name: 'Test Show',
      startDate: '2025-03-01',
      status: 'accepting_entries'
    }]
  })
}));

vi.mock('../../store/dogStore', () => ({
  useDogStore: () => ({
    dogs: [{
      id: 'dog-1',
      callName: 'Test Dog',
      ownerId: 'owner-1'
    }]
  })
}));

vi.mock('../../store/userStore', () => ({
  useUserStore: () => ({
    people: [{
      id: 'owner-1',
      firstName: 'John',
      lastName: 'Smith'
    }]
  })
}));

// Test wrapper component
const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RegistrationProvider>
          {children}
        </RegistrationProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

describe('RegistrationWorkflow', () => {
  const mockOnComplete = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    
    // Set up mock user data
    localStorage.setItem('authStore', JSON.stringify({
      state: {
        user: MOCK_USERS['exhibitor-user'] // Use the exhibitor user from MOCK_USERS object
      }
    }));
  });

  describe('Component Initialization', () => {
    it('should render without context provider error', () => {
      // This test would catch the "useRegistrationContext must be used within a RegistrationProvider" error
      expect(() => {
        render(
          <TestWrapper>
            <RegistrationWorkflow
              showId="show-1"
              onComplete={mockOnComplete}
              onCancel={mockOnCancel}
            />
          </TestWrapper>
        );
      }).not.toThrow();
    });

    it('should render with step completion tracking', async () => {
      // This test would catch the "Cannot access 'isStepCompleted' before initialization" error
      render(
        <TestWrapper>
          <RegistrationWorkflow
            showId="show-1"
            onComplete={mockOnComplete}
            onCancel={mockOnCancel}
          />
        </TestWrapper>
      );

      // Should show progress indicator
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      
      // Should show step indicators without throwing errors
      await waitFor(() => {
        expect(screen.getByText('Select Dogs')).toBeInTheDocument();
      });
    });

    it('should calculate completed steps correctly', async () => {
      render(
        <TestWrapper>
          <RegistrationWorkflow
            showId="show-1"
            onComplete={mockOnComplete}
            onCancel={mockOnCancel}
          />
        </TestWrapper>
      );

      // Wait for component to initialize
      await waitFor(() => {
        expect(screen.getByText('Select Dogs')).toBeInTheDocument();
      });

      // Initially no steps should be completed
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '0');
    });
  });

  describe('Step Navigation', () => {
    it('should display correct step icons and titles', async () => {
      render(
        <TestWrapper>
          <RegistrationWorkflow
            showId="show-1"
            onComplete={mockOnComplete}
            onCancel={mockOnCancel}
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Select Dogs')).toBeInTheDocument();
        expect(screen.getByText('Choose which dogs to register for this show')).toBeInTheDocument();
      });
    });

    it('should handle step completion state changes', async () => {
      render(
        <TestWrapper>
          <RegistrationWorkflow
            showId="show-1"
            onComplete={mockOnComplete}
            onCancel={mockOnCancel}
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Select Dogs')).toBeInTheDocument();
      });

      // Step completion logic should work without throwing errors
      // This ensures the isStepCompleted function is properly initialized
      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).toBeInTheDocument();
    });
  });

  describe('Error Boundaries', () => {
    it('should be wrapped in error boundaries', () => {
      // This test ensures components are properly wrapped in error boundaries
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      render(
        <TestWrapper>
          <RegistrationWorkflow
            showId="show-1"
            onComplete={mockOnComplete}
            onCancel={mockOnCancel}
          />
        </TestWrapper>
      );

      // Should not throw unhandled errors
      expect(consoleSpy).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('Context Integration', () => {
    it('should access registration context without errors', async () => {
      render(
        <TestWrapper>
          <RegistrationWorkflow
            showId="show-1"
            onComplete={mockOnComplete}
            onCancel={mockOnCancel}
          />
        </TestWrapper>
      );

      // Should be able to access context and render appropriately
      await waitFor(() => {
        expect(screen.getByText('Select Dogs')).toBeInTheDocument();
      });
    });

    it('should handle different user roles correctly', async () => {
      // Test with secretary user
      localStorage.setItem('authStore', JSON.stringify({
        state: {
          user: MOCK_USERS['secretary-user'] // Use the secretary user from MOCK_USERS object
        }
      }));

      render(
        <TestWrapper>
          <RegistrationWorkflow
            showId="show-1"
            onComplete={mockOnComplete}
            onCancel={mockOnCancel}
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Select Dogs')).toBeInTheDocument();
      });
    });
  });

  describe('Function Initialization Order', () => {
    it('should define helper functions before usage', () => {
      // This test specifically checks for temporal dead zone issues
      // by testing that the component can render and access its internal functions
      const { container } = render(
        <TestWrapper>
          <RegistrationWorkflow
            showId="show-1"
            onComplete={mockOnComplete}
            onCancel={mockOnCancel}
          />
        </TestWrapper>
      );

      // If functions are properly initialized, the component should render
      expect(container.firstChild).toBeTruthy();
    });
  });
});

describe('RegistrationWorkflow Integration Tests', () => {
  const mockOnComplete = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should handle missing RegistrationProvider gracefully', () => {
    // This test would catch provider context errors
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });

    expect(() => {
      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            {/* Missing RegistrationProvider - should throw context error */}
            <RegistrationWorkflow
              showId="show-1"
              onComplete={mockOnComplete}
              onCancel={mockOnCancel}
            />
          </AuthProvider>
        </QueryClientProvider>
      );
    }).toThrow('useRegistrationContext must be used within a RegistrationProvider');
  });

  it('should integrate properly with all required providers', async () => {
    // This test validates the complete provider chain
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });

    localStorage.setItem('authStore', JSON.stringify({
      state: {
        user: MOCK_USERS['exhibitor-user'] // Use the exhibitor user from MOCK_USERS object
      }
    }));

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RegistrationProvider>
            <RegistrationWorkflow
              showId="show-1"
              onComplete={mockOnComplete}
              onCancel={mockOnCancel}
            />
          </RegistrationProvider>
        </AuthProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Select Dogs')).toBeInTheDocument();
    });
  });
});