import type { ReactNode } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthContext } from '@/hooks/useAuthContext';
import { PERMISSIONS, ScopeType, UserRole } from '@/types/auth-types';
import {
  mockAuthReturn,
  renderWithAuthProvider as renderWithProvider,
} from './AuthContext.testHarness';

const { mockNavigate, mockRbacService, mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockNavigate: vi.fn(),
  mockRbacService: {
    getUserPermissions: vi.fn(),
    getUserRoles: vi.fn(),
    getUserRolesByEmail: vi.fn(),
    hasPermission: vi.fn(),
    checkPermission: vi.fn(),
    clearUserCache: vi.fn(),
    clearAllCache: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: mockRbacService,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => {
      mockNavigate(to);
      return <div data-testid="navigate">Redirecting to {to}</div>;
    },
  };
});

import { AuthProvider, ProtectedRoute } from '@/context/AuthContext';

const renderWithAuthProvider = (children: ReactNode, initialRoute = '/') =>
  renderWithProvider(AuthProvider, children, initialRoute);

describe('AuthContext routes and auth methods', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(mockAuthReturn);
    mockRbacService.getUserPermissions.mockResolvedValue({
      roles: [],
      permissions: [],
      effectivePermissions: [],
      effectivePermissionScopes: [],
    });
    mockRbacService.getUserRoles.mockResolvedValue([]);
    mockRbacService.getUserRolesByEmail.mockResolvedValue([]);
    mockRbacService.hasPermission.mockResolvedValue(false);
    mockRbacService.checkPermission.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('ProtectedRoute', () => {
    const TestPage = () => <div data-testid="protected-content">Protected Content</div>;

    it('shows a loading skeleton while authentication loads', () => {
      mockUseAuth.mockReturnValue({ ...mockAuthReturn, loading: true });

      renderWithAuthProvider(
        <ProtectedRoute>
          <TestPage />
        </ProtectedRoute>
      );

      expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
      expect(screen.getByRole('status', { name: 'Loading protected page' })).toBeInTheDocument();
    });

    it('preserves the requested route through sign-in', () => {
      mockUseAuth.mockReturnValue({ ...mockAuthReturn, user: null });

      renderWithAuthProvider(
        <ProtectedRoute>
          <TestPage />
        </ProtectedRoute>,
        '/shows/show-1/register?dog=dog-1'
      );

      expect(screen.getByTestId('navigate')).toHaveTextContent(
        'Redirecting to /sign-in?redirectTo=%2Fshows%2Fshow-1%2Fregister%3Fdog%3Ddog-1'
      );
    });

    it('supports a custom unauthenticated redirect', () => {
      mockUseAuth.mockReturnValue({ ...mockAuthReturn, user: null });

      renderWithAuthProvider(
        <ProtectedRoute redirectTo="/custom-login">
          <TestPage />
        </ProtectedRoute>
      );

      expect(screen.getByTestId('navigate')).toHaveTextContent('Redirecting to /custom-login');
    });

    it('shows content to an authenticated user', async () => {
      renderWithAuthProvider(
        <ProtectedRoute>
          <TestPage />
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      });
    });

    it('enforces required roles', async () => {
      renderWithAuthProvider(
        <ProtectedRoute requiredRole={UserRole.SITE_ADMIN}>
          <TestPage />
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(screen.getByText(/You don't have permission/)).toBeInTheDocument();
        expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
      });
    });

    it('allows a matching required role', async () => {
      renderWithAuthProvider(
        <ProtectedRoute requiredRole={UserRole.EXHIBITOR}>
          <TestPage />
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      });
    });

    it('enforces required permissions', async () => {
      renderWithAuthProvider(
        <ProtectedRoute requiredPermission={PERMISSIONS.ADMIN_MANAGE_USERS}>
          <TestPage />
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(screen.getByText(/You don't have permission/)).toBeInTheDocument();
        expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
      });
    });

    it('allows a matching required permission', async () => {
      renderWithAuthProvider(
        <ProtectedRoute requiredPermission={PERMISSIONS.DOG_CREATE}>
          <TestPage />
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      });
    });

    it('renders a custom authorization fallback', async () => {
      const fallback = <div data-testid="custom-fallback">Custom Fallback</div>;

      renderWithAuthProvider(
        <ProtectedRoute requiredRole={UserRole.SITE_ADMIN} fallback={fallback}>
          <TestPage />
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
        expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
      });
    });

    it('enforces scoped permissions', async () => {
      const scope = { type: ScopeType.CLUB, id: 'club-123' };

      renderWithAuthProvider(
        <ProtectedRoute requiredPermission={PERMISSIONS.SHOW_MANAGE} scope={scope}>
          <TestPage />
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(screen.getByText(/You don't have permission/)).toBeInTheDocument();
      });
    });
  });

  describe('authentication methods', () => {
    it.each([
      {
        label: 'Sign In',
        configure: (spy: ReturnType<typeof vi.fn>) => ({ signIn: spy }),
        invoke: (auth: ReturnType<typeof useAuthContext>) =>
          auth.signIn('test@example.com', 'password'),
        expected: ['test@example.com', 'password'],
      },
      {
        label: 'Sign Up',
        configure: (spy: ReturnType<typeof vi.fn>) => ({ signUp: spy }),
        invoke: (auth: ReturnType<typeof useAuthContext>) =>
          auth.signUp('new@example.com', 'password123'),
        expected: ['new@example.com', 'password123'],
      },
      {
        label: 'Sign Out',
        configure: (spy: ReturnType<typeof vi.fn>) => ({ signOut: spy }),
        invoke: (auth: ReturnType<typeof useAuthContext>) => auth.signOut(),
        expected: [],
      },
      {
        label: 'Reset Password',
        configure: (spy: ReturnType<typeof vi.fn>) => ({ resetPassword: spy }),
        invoke: (auth: ReturnType<typeof useAuthContext>) =>
          auth.resetPassword('reset@example.com'),
        expected: ['reset@example.com'],
      },
    ])('delegates $label', async ({ label, configure, invoke, expected }) => {
      const method = vi.fn();
      mockUseAuth.mockReturnValue({ ...mockAuthReturn, ...configure(method) });

      const TestComponent = () => {
        const auth = useAuthContext();
        return <button onClick={() => void invoke(auth)}>{label}</button>;
      };

      renderWithAuthProvider(<TestComponent />);
      await userEvent.click(screen.getByRole('button', { name: label }));

      expect(method).toHaveBeenCalledWith(...expected);
    });
  });
});
