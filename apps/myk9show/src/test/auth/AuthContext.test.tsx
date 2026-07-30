import React from 'react';
import { renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthContext } from '@/hooks/useAuthContext';
import { MOCK_USERS, PERMISSIONS, UserRole } from '@/types/auth-types';
import { createChainableQuery, mockSupabase } from '@/test/mocks/supabase';
import {
  createAuthWrapper,
  mockAuthReturn,
  mockUser,
  renderWithAuthProvider as renderWithProvider,
} from './AuthContext.testHarness';

const { mockRbacService, mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
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

import { AuthProvider } from '@/context/AuthContext';

const renderWithAuthProvider = (children: React.ReactNode, initialRoute = '/') =>
  renderWithProvider(AuthProvider, children, initialRoute);

describe('AuthContext', () => {
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

  describe('AuthProvider', () => {
    it('provides authentication context', async () => {
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
      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });
    });

    it('creates default exhibitor access for an authenticated user', async () => {
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

      await waitFor(() => {
        expect(screen.getByTestId('user-roles')).toHaveTextContent('exhibitor');
        expect(screen.getByTestId('user-permissions')).not.toHaveTextContent('0');
      });
    });

    it('uses a matching development mock user', () => {
      const adminMockUser = Object.values(MOCK_USERS).find(user =>
        user.roles.includes(UserRole.SITE_ADMIN)
      );
      expect(adminMockUser).toBeDefined();
      mockUseAuth.mockReturnValue({
        ...mockAuthReturn,
        user: { ...mockUser, email: adminMockUser?.email },
      });

      const TestComponent = () => {
        const auth = useAuthContext();
        return <span data-testid="user-roles">{auth.userWithRoles?.roles.join(', ')}</span>;
      };

      renderWithAuthProvider(<TestComponent />);

      expect(screen.getByTestId('user-roles')).toHaveTextContent(
        adminMockUser?.roles.join(', ') ?? ''
      );
    });

    it('exposes the authentication loading state', () => {
      mockUseAuth.mockReturnValue({ ...mockAuthReturn, loading: true });

      const TestComponent = () => {
        const auth = useAuthContext();
        return <span data-testid="loading">{auth.loading.toString()}</span>;
      };

      renderWithAuthProvider(<TestComponent />);

      expect(screen.getByTestId('loading')).toHaveTextContent('true');
    });

    it('clears the user state after sign-out', () => {
      mockUseAuth.mockReturnValue({ ...mockAuthReturn, user: null });

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

  describe('RBAC methods', () => {
    it('checks roles', async () => {
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

      await waitFor(() => {
        expect(screen.getByTestId('has-exhibitor')).toHaveTextContent('true');
        expect(screen.getByTestId('has-admin')).toHaveTextContent('false');
      });
    });

    it('checks permissions', async () => {
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

      await waitFor(() => {
        expect(screen.getByTestId('can-create-dog')).toHaveTextContent('true');
        expect(screen.getByTestId('can-manage-users')).toHaveTextContent('false');
      });
    });

    it('returns the active user roles', async () => {
      const TestComponent = () => {
        const auth = useAuthContext();
        return <span data-testid="user-roles">{auth.getUserRoles().join(', ')}</span>;
      };

      renderWithAuthProvider(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('user-roles')).toHaveTextContent('exhibitor');
      });
    });

    it('keeps seeded secretary access while database RBAC loads', () => {
      mockUseAuth.mockReturnValue({
        ...mockAuthReturn,
        user: { ...mockUser, email: 'secretary@myk9t.com' },
      });

      const TestComponent = () => {
        const auth = useAuthContext();
        return <span data-testid="user-roles">{auth.userWithRoles?.roles.join(', ')}</span>;
      };

      renderWithAuthProvider(<TestComponent />);

      expect(screen.getByTestId('user-roles')).toHaveTextContent(UserRole.SECRETARY);
    });

    it('switches development mock users', async () => {
      const TestComponent = () => {
        const auth = useAuthContext();

        React.useEffect(() => {
          const adminUser = Object.values(MOCK_USERS).find(user =>
            user.roles.includes(UserRole.SITE_ADMIN)
          );
          if (adminUser?.email) auth.switchUserRole(adminUser.email);
        }, [auth]);

        return <span data-testid="user-roles">{auth.userWithRoles?.roles.join(', ')}</span>;
      };

      renderWithAuthProvider(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('user-roles')).toHaveTextContent('admin');
      });
    });

    it('adds the database person id to a selected development mock user', async () => {
      localStorage.setItem('dev-current-mock-user', 'test-secretary-user');
      mockSupabase.from.mockImplementation((table: string) =>
        table === 'people'
          ? createChainableQuery({
              data: {
                id: 'person-test-secretary',
                first_name: 'Test',
                last_name: 'Secretary',
                email: 'testsecretary@example.com',
                status: 'active',
              },
              error: null,
            })
          : createChainableQuery()
      );

      const TestComponent = () => {
        const auth = useAuthContext();
        return (
          <div>
            <span data-testid="user-roles">{auth.userWithRoles?.roles.join(', ')}</span>
            <span data-testid="database-user-id">{auth.userWithRoles?.databaseUserId ?? ''}</span>
          </div>
        );
      };

      renderWithAuthProvider(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('user-roles')).toHaveTextContent(UserRole.SECRETARY);
        expect(screen.getByTestId('database-user-id')).toHaveTextContent('person-test-secretary');
      });
    });
  });

  describe('useAuthContext', () => {
    it('throws outside AuthProvider', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => renderHook(() => useAuthContext())).toThrow(
        'useAuthContext must be used within an AuthProvider'
      );
      errorSpy.mockRestore();
    });

    it('returns the shared context inside AuthProvider', () => {
      const { result } = renderHook(() => useAuthContext(), {
        wrapper: createAuthWrapper(AuthProvider),
      });

      expect(result.current.user).toBeDefined();
      expect(result.current.signIn).toBeDefined();
      expect(result.current.hasRole).toBeDefined();
      expect(result.current.hasPermission).toBeDefined();
    });
  });
});
