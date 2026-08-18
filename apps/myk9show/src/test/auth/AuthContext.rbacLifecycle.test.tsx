import type { ReactNode } from 'react';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthContext } from '@/hooks/useAuthContext';
import { PERMISSIONS, UserRole } from '@/types/auth-types';
import {
  accessForRole,
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

import { AuthProvider, ProtectedRoute } from '@/context/AuthContext';
import { loadRbacPermissionsCache, saveRbacPermissionsCache } from '@/context/rbacPermissionsCache';

const renderWithAuthProvider = (children: ReactNode, initialRoute = '/') =>
  renderWithProvider(AuthProvider, children, initialRoute);

describe('AuthContext RBAC lifecycle', () => {
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

  it('retries transient RBAC fetch failures before surfacing an error', async () => {
    mockRbacService.getUserPermissions
      .mockRejectedValueOnce(
        new Error('Failed to get user permissions: TypeError: Failed to fetch')
      )
      .mockResolvedValueOnce({
        roles: [],
        permissions: [],
        effectivePermissions: ['show:view'],
        effectivePermissionScopes: [],
      });

    const TestComponent = () => {
      const auth = useAuthContext();
      return (
        <div>
          <span data-testid="rbac-loading">{auth.rbacLoading.toString()}</span>
          <span data-testid="rbac-error">{auth.rbacError ?? 'none'}</span>
          <span data-testid="db-permissions">{auth.dbPermissions.join(',')}</span>
        </div>
      );
    };

    renderWithAuthProvider(<TestComponent />);

    await waitFor(() => {
      expect(mockRbacService.getUserPermissions).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByTestId('rbac-loading')).toHaveTextContent('false');
      expect(screen.getByTestId('rbac-error')).toHaveTextContent('none');
      expect(screen.getByTestId('db-permissions')).toHaveTextContent('show:view');
    });
  });

  it('refreshes RBAC roles on a five-minute interval', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockRbacService.getUserPermissions
      .mockResolvedValueOnce({
        roles: [
          {
            role_id: 'role-secretary',
            role: { name: UserRole.SECRETARY, display_name: 'Secretary' },
            is_active: true,
          },
        ],
        permissions: [],
        effectivePermissions: [PERMISSIONS.SHOW_MANAGE],
        effectivePermissionScopes: [],
      })
      .mockResolvedValueOnce({
        roles: [
          {
            role_id: 'role-exhibitor',
            role: { name: UserRole.EXHIBITOR, display_name: 'Exhibitor' },
            is_active: true,
          },
        ],
        permissions: [],
        effectivePermissions: [PERMISSIONS.DOG_CREATE],
        effectivePermissionScopes: [],
      });

    const TestComponent = () => {
      const auth = useAuthContext();
      return <span data-testid="user-roles">{auth.userWithRoles?.roles.join(', ')}</span>;
    };

    renderWithAuthProvider(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('user-roles')).toHaveTextContent(UserRole.SECRETARY);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(mockRbacService.getUserPermissions).toHaveBeenCalledTimes(1);
    expect(mockRbacService.clearUserCache).not.toHaveBeenCalled();
    expect(screen.getByTestId('user-roles')).toHaveTextContent(UserRole.SECRETARY);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(240_000);
    });

    await waitFor(() => {
      expect(mockRbacService.clearUserCache).toHaveBeenCalledWith(mockUser.id);
      expect(screen.getByTestId('user-roles')).toHaveTextContent(UserRole.EXHIBITOR);
      expect(screen.getByTestId('user-roles')).not.toHaveTextContent(UserRole.SECRETARY);
    });
  });

  it('exposes detailed RBAC state and invalidates before explicit refresh', async () => {
    mockRbacService.getUserPermissions.mockResolvedValue({
      roles: [
        {
          id: 'user-role-1',
          user_id: mockUser.id,
          role_id: 'role-secretary',
          club_id: 'club-1',
          show_id: null,
          granted_by: null,
          granted_at: null,
          expires_at: null,
          is_active: true,
          scope_type: 'club',
          scope_id: 'club-1',
          role: {
            id: 'role-secretary',
            name: UserRole.SECRETARY,
            description: null,
            is_system: true,
            permissions: null,
            created_at: null,
          },
        },
      ],
      permissions: [
        {
          permission_id: 'permission-1',
          permission_code: PERMISSIONS.SHOW_MANAGE,
          permission_name: 'Manage shows',
          description: null,
          category: 'show',
          role_id: 'role-secretary',
          role_name: UserRole.SECRETARY,
          scope_type: 'club',
          scope_id: 'club-1',
        },
      ],
      effectivePermissions: [PERMISSIONS.SHOW_MANAGE, PERMISSIONS.SHOW_CREATE],
      effectivePermissionScopes: [
        {
          permission_code: PERMISSIONS.SHOW_MANAGE,
          scope_type: 'club',
          scope_id: 'club-1',
        },
        {
          permission_code: PERMISSIONS.SHOW_CREATE,
          scope_type: 'club',
          scope_id: 'club-1',
        },
      ],
    });

    const TestComponent = () => {
      const auth = useAuthContext();
      return (
        <div>
          <span data-testid="detailed-role">{auth.rbacUserRoles[0]?.role.name}</span>
          <span data-testid="permission-scope">
            {auth.rbacScopedPermissions[0]?.scope_type}:{auth.rbacScopedPermissions[0]?.scope_id}
          </span>
          <span data-testid="same-club-permission">
            {auth.hasPermission(PERMISSIONS.SHOW_MANAGE, { type: 'club', id: 'club-1' }).toString()}
          </span>
          <span data-testid="different-club-permission">
            {auth.hasPermission(PERMISSIONS.SHOW_MANAGE, { type: 'club', id: 'club-2' }).toString()}
          </span>
          <span data-testid="inherited-same-club-permission">
            {auth.hasPermission(PERMISSIONS.SHOW_CREATE, { type: 'club', id: 'club-1' }).toString()}
          </span>
          <span data-testid="inherited-different-club-permission">
            {auth.hasPermission(PERMISSIONS.SHOW_CREATE, { type: 'club', id: 'club-2' }).toString()}
          </span>
          <span data-testid="last-refreshed">{auth.rbacLastRefreshed ?? 'none'}</span>
          <button type="button" onClick={() => void auth.refreshPermissions()}>
            Refresh access
          </button>
        </div>
      );
    };

    renderWithAuthProvider(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('detailed-role')).toHaveTextContent(UserRole.SECRETARY);
      expect(screen.getByTestId('permission-scope')).toHaveTextContent('club:club-1');
      expect(screen.getByTestId('same-club-permission')).toHaveTextContent('true');
      expect(screen.getByTestId('different-club-permission')).toHaveTextContent('false');
      expect(screen.getByTestId('inherited-same-club-permission')).toHaveTextContent('true');
      expect(screen.getByTestId('inherited-different-club-permission')).toHaveTextContent('false');
      expect(screen.getByTestId('last-refreshed')).not.toHaveTextContent('none');
    });

    await userEvent.click(screen.getByRole('button', { name: 'Refresh access' }));

    await waitFor(() => {
      expect(mockRbacService.clearUserCache).toHaveBeenCalledWith(mockUser.id);
      expect(mockRbacService.getUserPermissions).toHaveBeenCalledTimes(2);
    });
  });

  it('does not expose prior-user RBAC state while the next user loads', async () => {
    let resolveSecondUser: ((value: ReturnType<typeof accessForRole>) => void) | undefined;
    mockRbacService.getUserPermissions
      .mockResolvedValueOnce(accessForRole(UserRole.SECRETARY))
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveSecondUser = resolve;
          })
      );

    const TestComponent = () => {
      const auth = useAuthContext();
      return (
        <div>
          <span data-testid="current-user">{auth.user?.id}</span>
          <span data-testid="current-roles">{auth.userWithRoles?.roles.join(',') ?? 'none'}</span>
        </div>
      );
    };

    const view = renderWithAuthProvider(<TestComponent />);
    await waitFor(() => {
      expect(screen.getByTestId('current-roles')).toHaveTextContent(UserRole.SECRETARY);
    });

    mockUseAuth.mockReturnValue({
      ...mockAuthReturn,
      user: { ...mockUser, id: 'second-user-id' },
    });
    view.rerender(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('current-user')).toHaveTextContent('second-user-id');
      expect(screen.getByTestId('current-roles')).toHaveTextContent('none');
    });

    resolveSecondUser?.(accessForRole(UserRole.EXHIBITOR));
  });

  it('ignores an explicit-refresh response after the user changes', async () => {
    let resolveStaleRefresh: ((value: ReturnType<typeof accessForRole>) => void) | undefined;
    mockRbacService.getUserPermissions
      .mockResolvedValueOnce(accessForRole(UserRole.SECRETARY))
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveStaleRefresh = resolve;
          })
      )
      .mockResolvedValueOnce(accessForRole(UserRole.EXHIBITOR));

    const TestComponent = () => {
      const auth = useAuthContext();
      return (
        <div>
          <span data-testid="race-roles">{auth.userWithRoles?.roles.join(',') ?? 'none'}</span>
          <button type="button" onClick={() => void auth.refreshPermissions()}>
            Refresh permissions
          </button>
        </div>
      );
    };

    const view = renderWithAuthProvider(<TestComponent />);
    await waitFor(() => {
      expect(screen.getByTestId('race-roles')).toHaveTextContent(UserRole.SECRETARY);
    });

    await userEvent.click(screen.getByRole('button', { name: 'Refresh permissions' }));
    mockUseAuth.mockReturnValue({
      ...mockAuthReturn,
      user: { ...mockUser, id: 'second-user-id' },
    });
    view.rerender(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('race-roles')).toHaveTextContent(UserRole.EXHIBITOR);
    });

    await act(async () => {
      resolveStaleRefresh?.(accessForRole(UserRole.SITE_ADMIN));
    });

    expect(screen.getByTestId('race-roles')).toHaveTextContent(UserRole.EXHIBITOR);
    expect(screen.getByTestId('race-roles')).not.toHaveTextContent(UserRole.SITE_ADMIN);
  });

  it('keeps the newest same-user refresh when an older load finishes last', async () => {
    let resolveInitialLoad: ((value: ReturnType<typeof accessForRole>) => void) | undefined;
    mockRbacService.getUserPermissions
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveInitialLoad = resolve;
          })
      )
      .mockResolvedValueOnce(accessForRole(UserRole.EXHIBITOR));

    const TestComponent = () => {
      const auth = useAuthContext();
      return (
        <div>
          <span data-testid="same-user-race-roles">
            {auth.userWithRoles?.roles.join(',') ?? 'none'}
          </span>
          <button type="button" onClick={() => void auth.refreshPermissions()}>
            Refresh current access
          </button>
        </div>
      );
    };

    renderWithAuthProvider(<TestComponent />);
    await waitFor(() => {
      expect(mockRbacService.getUserPermissions).toHaveBeenCalledTimes(1);
    });

    await userEvent.click(screen.getByRole('button', { name: 'Refresh current access' }));
    await waitFor(() => {
      expect(screen.getByTestId('same-user-race-roles')).toHaveTextContent(UserRole.EXHIBITOR);
    });

    await act(async () => {
      resolveInitialLoad?.(accessForRole(UserRole.SITE_ADMIN));
    });

    expect(screen.getByTestId('same-user-race-roles')).toHaveTextContent(UserRole.EXHIBITOR);
    expect(screen.getByTestId('same-user-race-roles')).not.toHaveTextContent(UserRole.SITE_ADMIN);
  });

  it('persists permissions to the local cache on a successful load', async () => {
    mockRbacService.getUserPermissions.mockResolvedValue(accessForRole(UserRole.SECRETARY));

    const TestComponent = () => {
      const auth = useAuthContext();
      return (
        <span data-testid="persist-roles">{auth.userWithRoles?.roles.join(',') ?? 'none'}</span>
      );
    };

    renderWithAuthProvider(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('persist-roles')).toHaveTextContent(UserRole.SECRETARY);
    });

    const cached = loadRbacPermissionsCache(mockUser.id);
    expect(cached?.data.roles[0]?.role?.name).toBe(UserRole.SECRETARY);
  });

  it('cold boot offline: hydrates roles from the persisted cache and renders gated routes', async () => {
    saveRbacPermissionsCache(mockUser.id, accessForRole(UserRole.SECRETARY));
    // Offline network failure — matches the transient pattern, so the loader
    // retries 3x before settling, exactly like a real cold boot with no network.
    mockRbacService.getUserPermissions.mockRejectedValue(
      new Error('Failed to get user permissions: TypeError: Failed to fetch')
    );

    const TestComponent = () => {
      const auth = useAuthContext();
      return (
        <div>
          <span data-testid="offline-roles">{auth.userWithRoles?.roles.join(',') ?? 'none'}</span>
          <span data-testid="offline-from-cache">{auth.rbacFromCacheAt ?? 'live'}</span>
          <ProtectedRoute requiredRole={UserRole.SECRETARY} fallback={<span>denied</span>}>
            <span>secretary surface</span>
          </ProtectedRoute>
        </div>
      );
    };

    renderWithAuthProvider(<TestComponent />);

    await waitFor(
      () => {
        expect(screen.getByTestId('offline-roles')).toHaveTextContent(UserRole.SECRETARY);
      },
      { timeout: 5000 }
    );
    expect(screen.getByTestId('offline-from-cache')).not.toHaveTextContent('live');
    expect(screen.getByText('secretary surface')).toBeInTheDocument();
    expect(screen.queryByText('denied')).not.toBeInTheDocument();
  });

  it('cold boot offline with no cache still settles at zero roles with an error', async () => {
    mockRbacService.getUserPermissions.mockRejectedValue(
      new Error('Failed to get user permissions: TypeError: Failed to fetch')
    );

    const TestComponent = () => {
      const auth = useAuthContext();
      return (
        <div>
          <span data-testid="no-cache-roles">{auth.userWithRoles?.roles.join(',') ?? 'none'}</span>
          <span data-testid="no-cache-error">{auth.rbacError ?? 'none'}</span>
        </div>
      );
    };

    renderWithAuthProvider(<TestComponent />);

    await waitFor(
      () => {
        expect(screen.getByTestId('no-cache-error')).not.toHaveTextContent('none');
      },
      { timeout: 5000 }
    );
    expect(screen.getByTestId('no-cache-roles')).toHaveTextContent('none');
  });

  it('does NOT hydrate from cache on a non-network failure — a server error is not offline', async () => {
    saveRbacPermissionsCache(mockUser.id, accessForRole(UserRole.SECRETARY));
    mockRbacService.getUserPermissions.mockRejectedValue(new Error('boom: RPC exploded'));

    const TestComponent = () => {
      const auth = useAuthContext();
      return (
        <div>
          <span data-testid="server-error-roles">
            {auth.userWithRoles?.roles.join(',') ?? 'none'}
          </span>
          <span data-testid="server-error">{auth.rbacError ?? 'none'}</span>
          <span data-testid="server-error-from-cache">{auth.rbacFromCacheAt ?? 'live'}</span>
        </div>
      );
    };

    renderWithAuthProvider(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('server-error')).not.toHaveTextContent('none');
    });
    expect(screen.getByTestId('server-error-roles')).toHaveTextContent('none');
    expect(screen.getByTestId('server-error-from-cache')).toHaveTextContent('live');
  });

  it('a successful load after cache hydration clears the from-cache marker', async () => {
    saveRbacPermissionsCache(mockUser.id, accessForRole(UserRole.SECRETARY));
    const offlineError = new Error('Failed to get user permissions: TypeError: Failed to fetch');
    mockRbacService.getUserPermissions
      .mockRejectedValueOnce(offlineError)
      .mockRejectedValueOnce(offlineError)
      .mockRejectedValueOnce(offlineError)
      .mockRejectedValueOnce(offlineError)
      .mockResolvedValueOnce(accessForRole(UserRole.SECRETARY));

    const TestComponent = () => {
      const auth = useAuthContext();
      return (
        <div>
          <span data-testid="marker-from-cache">{auth.rbacFromCacheAt ?? 'live'}</span>
          <button type="button" onClick={() => void auth.refreshPermissions()}>
            Reconnect refresh
          </button>
        </div>
      );
    };

    renderWithAuthProvider(<TestComponent />);

    await waitFor(
      () => {
        expect(screen.getByTestId('marker-from-cache')).not.toHaveTextContent('live');
      },
      { timeout: 5000 }
    );

    await userEvent.click(screen.getByRole('button', { name: 'Reconnect refresh' }));

    await waitFor(() => {
      expect(screen.getByTestId('marker-from-cache')).toHaveTextContent('live');
    });
  });

  it('warm path: preserves loaded roles and keeps gated routes open when a refresh fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockRbacService.getUserPermissions
      .mockResolvedValueOnce(accessForRole(UserRole.SECRETARY))
      .mockRejectedValue(new Error('boom: refresh failed'));

    const TestComponent = () => {
      const auth = useAuthContext();
      return (
        <div>
          <span data-testid="warm-roles">{auth.userWithRoles?.roles.join(',') ?? 'none'}</span>
          <ProtectedRoute requiredRole={UserRole.SECRETARY} fallback={<span>denied</span>}>
            <span>secretary surface</span>
          </ProtectedRoute>
        </div>
      );
    };

    renderWithAuthProvider(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('warm-roles')).toHaveTextContent(UserRole.SECRETARY);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);
    });

    await waitFor(() => {
      expect(mockRbacService.getUserPermissions).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByTestId('warm-roles')).toHaveTextContent(UserRole.SECRETARY);
    expect(screen.getByText('secretary surface')).toBeInTheDocument();
    expect(screen.queryByText('denied')).not.toBeInTheDocument();
  });

  it("clears the prior user's persisted cache when the account changes", async () => {
    mockRbacService.getUserPermissions.mockResolvedValue(accessForRole(UserRole.SECRETARY));

    const TestComponent = () => {
      const auth = useAuthContext();
      return <span data-testid="switch-user">{auth.user?.id ?? 'signed-out'}</span>;
    };

    const view = renderWithAuthProvider(<TestComponent />);
    await waitFor(() => {
      expect(loadRbacPermissionsCache(mockUser.id)).not.toBeNull();
    });

    mockUseAuth.mockReturnValue({
      ...mockAuthReturn,
      user: null,
    });
    view.rerender(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('switch-user')).toHaveTextContent('signed-out');
      expect(loadRbacPermissionsCache(mockUser.id)).toBeNull();
    });
  });

  it('invalidates the prior user service cache on sign-out', async () => {
    const TestComponent = () => {
      const auth = useAuthContext();
      return <span data-testid="signed-in-user">{auth.user?.id ?? 'signed-out'}</span>;
    };

    const view = renderWithAuthProvider(<TestComponent />);
    await waitFor(() => {
      expect(screen.getByTestId('signed-in-user')).toHaveTextContent(mockUser.id);
    });

    mockUseAuth.mockReturnValue({
      ...mockAuthReturn,
      user: null,
    });
    view.rerender(<TestComponent />);

    await waitFor(() => {
      expect(mockRbacService.clearUserCache).toHaveBeenCalledWith(mockUser.id);
      expect(screen.getByTestId('signed-in-user')).toHaveTextContent('signed-out');
    });
  });
});
