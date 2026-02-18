import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, ProtectedRoute } from '@/context/AuthContext';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole, PERMISSIONS, MOCK_USERS } from '@/types/auth-types';

// Mock the useAuth hook
const mockUseAuth = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock useUserRoles to avoid React Query loading state issues
vi.mock('@/hooks/queries/useUserRoles', () => ({
  useUserRoles: () => ({ data: [], isLoading: false, error: null }),
  useUserRoleNames: () => ({ data: [], isLoading: false, error: null }),
}));

// Mock RBACService to avoid async loading
vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: {
    getUserRoles: vi.fn().mockResolvedValue([]),
    getUserRolesByEmail: vi.fn().mockResolvedValue([]),
    hasPermission: vi.fn().mockResolvedValue(false),
  },
}));

// Mock Supabase types
vi.mock('@supabase/supabase-js', () => ({
  User: {},
}));

// Mock React Router
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => {
      mockNavigate(to);
      return <div data-testid="navigate">Redirecting to {to}</div>;
    },
  };
});

describe('AuthContext', () => {
  const mockUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    created_at: '2024-01-01T00:00:00Z',
  };

  const mockAuthReturn = {
    user: mockUser,
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    resetPassword: vi.fn(),
    updatePassword: vi.fn(),
    updateProfile: vi.fn(),
  };

  beforeEach(() => {
    mockUseAuth.mockReturnValue(mockAuthReturn);
    mockNavigate.mockClear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderWithAuthProvider = (children: React.ReactNode) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthProvider>{children}</AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  describe('AuthProvider', () => {
    it('should provide authentication context', () => {
      const TestComponent = () => {
        const auth = useAuthContext();
        return (
          <div>
            <span data-testid="user-email">{auth.user?.email || 'No user'}</span>
            <span data-testid="loading">{auth.loading.toString()}</span>
          </div>
        );
      };

      renderWithAuthProvider(<TestComponent />);

      expect(screen.getByTestId('user-email')).toHaveTextContent('test@example.com');
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    it('should create userWithRoles from authenticated user', () => {
      const TestComponent = () => {
        const auth = useAuthContext();
        return (
          <div>
            <span data-testid="user-roles">
              {auth.userWithRoles?.roles.join(', ') || 'No roles'}
            </span>
            <span data-testid="user-permissions">
              {auth.userWithRoles?.permissions.length || 0}
            </span>
          </div>
        );
      };

      renderWithAuthProvider(<TestComponent />);

      // Should default to exhibitor role for unknown users
      expect(screen.getByTestId('user-roles')).toHaveTextContent('exhibitor');
      expect(screen.getByTestId('user-permissions')).not.toHaveTextContent('0');
    });

    it('should use mock user when email matches', () => {
      // Use a mock user email
      const adminMockUser = Object.values(MOCK_USERS).find(u =>
        u.roles.includes(UserRole.SITE_ADMIN)
      );

      if (adminMockUser) {
        mockUseAuth.mockReturnValue({
          ...mockAuthReturn,
          user: { ...mockUser, email: adminMockUser.email },
        });

        const TestComponent = () => {
          const auth = useAuthContext();
          return (
            <div>
              <span data-testid="user-roles">
                {auth.userWithRoles?.roles.join(', ') || 'No roles'}
              </span>
            </div>
          );
        };

        renderWithAuthProvider(<TestComponent />);

        expect(screen.getByTestId('user-roles')).toHaveTextContent(adminMockUser.roles.join(', '));
      }
    });

    it('should handle loading state', () => {
      mockUseAuth.mockReturnValue({
        ...mockAuthReturn,
        loading: true,
      });

      const TestComponent = () => {
        const auth = useAuthContext();
        return <span data-testid="loading">{auth.loading.toString()}</span>;
      };

      renderWithAuthProvider(<TestComponent />);

      expect(screen.getByTestId('loading')).toHaveTextContent('true');
    });

    it('should handle no user state', () => {
      mockUseAuth.mockReturnValue({
        ...mockAuthReturn,
        user: null,
      });

      const TestComponent = () => {
        const auth = useAuthContext();
        return (
          <div>
            <span data-testid="user-email">{auth.user?.email || 'No user'}</span>
            <span data-testid="user-with-roles">
              {auth.userWithRoles ? 'Has roles' : 'No roles'}
            </span>
          </div>
        );
      };

      renderWithAuthProvider(<TestComponent />);

      expect(screen.getByTestId('user-email')).toHaveTextContent('No user');
      expect(screen.getByTestId('user-with-roles')).toHaveTextContent('No roles');
    });
  });

  describe('RBAC Methods', () => {
    it('should check if user has role', () => {
      const TestComponent = () => {
        const auth = useAuthContext();
        return (
          <div>
            <span data-testid="has-exhibitor">{auth.hasRole(UserRole.EXHIBITOR).toString()}</span>
            <span data-testid="has-admin">{auth.hasRole(UserRole.SITE_ADMIN).toString()}</span>
          </div>
        );
      };

      renderWithAuthProvider(<TestComponent />);

      expect(screen.getByTestId('has-exhibitor')).toHaveTextContent('true');
      expect(screen.getByTestId('has-admin')).toHaveTextContent('false');
    });

    it('should check if user has permission', () => {
      const TestComponent = () => {
        const auth = useAuthContext();
        return (
          <div>
            <span data-testid="can-create-dog">
              {auth.hasPermission(PERMISSIONS.DOG_CREATE).toString()}
            </span>
            <span data-testid="can-manage-users">
              {auth.hasPermission(PERMISSIONS.ADMIN_MANAGE_USERS).toString()}
            </span>
          </div>
        );
      };

      renderWithAuthProvider(<TestComponent />);

      expect(screen.getByTestId('can-create-dog')).toHaveTextContent('true');
      expect(screen.getByTestId('can-manage-users')).toHaveTextContent('false');
    });

    it('should get user roles', () => {
      const TestComponent = () => {
        const auth = useAuthContext();
        const roles = auth.getUserRoles();
        return <span data-testid="user-roles">{roles.join(', ')}</span>;
      };

      renderWithAuthProvider(<TestComponent />);

      expect(screen.getByTestId('user-roles')).toHaveTextContent('exhibitor');
    });

    it('should switch mock user for testing', () => {
      const TestComponent = () => {
        const auth = useAuthContext();

        React.useEffect(() => {
          // Find an admin mock user
          const adminUser = Object.values(MOCK_USERS).find(u =>
            u.roles.includes(UserRole.SITE_ADMIN)
          );
          if (adminUser) {
            auth.switchUserRole(adminUser.email);
          }
        }, [auth]);

        return (
          <span data-testid="user-roles">{auth.userWithRoles?.roles.join(', ') || 'No roles'}</span>
        );
      };

      renderWithAuthProvider(<TestComponent />);

      // Should eventually show admin role after switch
      waitFor(() => {
        expect(screen.getByTestId('user-roles')).toHaveTextContent('admin');
      });
    });
  });

  describe('useAuthContext hook', () => {
    it('should throw error when used outside AuthProvider', () => {
      // Temporarily suppress console.error for this test
      const originalError = console.error;
      console.error = vi.fn();

      expect(() => {
        renderHook(() => useAuthContext());
      }).toThrow('useAuthContext must be used within an AuthProvider');

      console.error = originalError;
    });

    it('should return auth context when used within provider', () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AuthProvider>{children}</AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>
      );

      const { result } = renderHook(() => useAuthContext(), { wrapper });

      expect(result.current.user).toBeDefined();
      expect(result.current.signIn).toBeDefined();
      expect(result.current.hasRole).toBeDefined();
      expect(result.current.hasPermission).toBeDefined();
    });
  });

  describe('ProtectedRoute', () => {
    const TestPage = () => <div data-testid="protected-content">Protected Content</div>;

    it('should show loading spinner when loading', () => {
      mockUseAuth.mockReturnValue({
        ...mockAuthReturn,
        loading: true,
      });

      renderWithAuthProvider(
        <ProtectedRoute>
          <TestPage />
        </ProtectedRoute>
      );

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    it('should redirect to sign-in when no user', () => {
      mockUseAuth.mockReturnValue({
        ...mockAuthReturn,
        user: null,
      });

      renderWithAuthProvider(
        <ProtectedRoute>
          <TestPage />
        </ProtectedRoute>
      );

      expect(screen.getByTestId('navigate')).toHaveTextContent('Redirecting to /sign-in');
    });

    it('should redirect to custom path when specified', () => {
      mockUseAuth.mockReturnValue({
        ...mockAuthReturn,
        user: null,
      });

      renderWithAuthProvider(
        <ProtectedRoute redirectTo="/custom-login">
          <TestPage />
        </ProtectedRoute>
      );

      expect(screen.getByTestId('navigate')).toHaveTextContent('Redirecting to /custom-login');
    });

    it('should show content when user is authenticated', () => {
      renderWithAuthProvider(
        <ProtectedRoute>
          <TestPage />
        </ProtectedRoute>
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });

    it('should check required role', () => {
      renderWithAuthProvider(
        <ProtectedRoute requiredRole={UserRole.SITE_ADMIN}>
          <TestPage />
        </ProtectedRoute>
      );

      // Should show fallback since user doesn't have site_admin role
      expect(screen.getByText(/You don't have permission/)).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('should allow access with correct role', () => {
      renderWithAuthProvider(
        <ProtectedRoute requiredRole={UserRole.EXHIBITOR}>
          <TestPage />
        </ProtectedRoute>
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });

    it('should check required permission', () => {
      renderWithAuthProvider(
        <ProtectedRoute requiredPermission={PERMISSIONS.ADMIN_MANAGE_USERS}>
          <TestPage />
        </ProtectedRoute>
      );

      // Should show fallback since user doesn't have manage users permission
      expect(screen.getByText(/You don't have permission/)).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('should allow access with correct permission', () => {
      renderWithAuthProvider(
        <ProtectedRoute requiredPermission={PERMISSIONS.DOG_CREATE}>
          <TestPage />
        </ProtectedRoute>
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });

    it('should show custom fallback', () => {
      const CustomFallback = () => <div data-testid="custom-fallback">Custom Fallback</div>;

      renderWithAuthProvider(
        <ProtectedRoute requiredRole={UserRole.SITE_ADMIN} fallback={<CustomFallback />}>
          <TestPage />
        </ProtectedRoute>
      );

      expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('should handle scoped permissions', () => {
      const scope = { type: 'club' as const, id: 'club-123' };

      renderWithAuthProvider(
        <ProtectedRoute requiredPermission={PERMISSIONS.SHOW_MANAGE} scope={scope}>
          <TestPage />
        </ProtectedRoute>
      );

      // Should show fallback since user doesn't have scoped permission
      expect(screen.getByText(/You don't have permission/)).toBeInTheDocument();
    });
  });

  describe('Authentication Methods', () => {
    it('should call signIn method', async () => {
      const signInSpy = vi.fn();
      mockUseAuth.mockReturnValue({
        ...mockAuthReturn,
        signIn: signInSpy,
      });

      const TestComponent = () => {
        const auth = useAuthContext();

        const handleSignIn = () => {
          auth.signIn('test@example.com', 'password');
        };

        return (
          <button data-testid="sign-in-btn" onClick={handleSignIn}>
            Sign In
          </button>
        );
      };

      renderWithAuthProvider(<TestComponent />);

      const user = userEvent.setup();
      await user.click(screen.getByTestId('sign-in-btn'));

      expect(signInSpy).toHaveBeenCalledWith('test@example.com', 'password');
    });

    it('should call signUp method', async () => {
      const signUpSpy = vi.fn();
      mockUseAuth.mockReturnValue({
        ...mockAuthReturn,
        signUp: signUpSpy,
      });

      const TestComponent = () => {
        const auth = useAuthContext();

        const handleSignUp = () => {
          auth.signUp('new@example.com', 'password123');
        };

        return (
          <button data-testid="sign-up-btn" onClick={handleSignUp}>
            Sign Up
          </button>
        );
      };

      renderWithAuthProvider(<TestComponent />);

      const user = userEvent.setup();
      await user.click(screen.getByTestId('sign-up-btn'));

      expect(signUpSpy).toHaveBeenCalledWith('new@example.com', 'password123');
    });

    it('should call signOut method', async () => {
      const signOutSpy = vi.fn();
      mockUseAuth.mockReturnValue({
        ...mockAuthReturn,
        signOut: signOutSpy,
      });

      const TestComponent = () => {
        const auth = useAuthContext();

        const handleSignOut = () => {
          auth.signOut();
        };

        return (
          <button data-testid="sign-out-btn" onClick={handleSignOut}>
            Sign Out
          </button>
        );
      };

      renderWithAuthProvider(<TestComponent />);

      const user = userEvent.setup();
      await user.click(screen.getByTestId('sign-out-btn'));

      expect(signOutSpy).toHaveBeenCalledWith();
    });

    it('should call resetPassword method', async () => {
      const resetPasswordSpy = vi.fn();
      mockUseAuth.mockReturnValue({
        ...mockAuthReturn,
        resetPassword: resetPasswordSpy,
      });

      const TestComponent = () => {
        const auth = useAuthContext();

        const handleResetPassword = () => {
          auth.resetPassword('reset@example.com');
        };

        return (
          <button data-testid="reset-password-btn" onClick={handleResetPassword}>
            Reset Password
          </button>
        );
      };

      renderWithAuthProvider(<TestComponent />);

      const user = userEvent.setup();
      await user.click(screen.getByTestId('reset-password-btn'));

      expect(resetPasswordSpy).toHaveBeenCalledWith('reset@example.com');
    });
  });
});
