import type { ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
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
import { createChainableQuery, mockSupabase } from '@/test/mocks/supabase';
import { useHasAnyEntryForShow } from '@/features/at-show/useHasAnyEntryForShow';
import { useExhibitorUpcomingShows } from '@/features/at-show/useExhibitorUpcomingShows';
import { useAccountEnteredShowIds } from '@/hooks/queries/useAccountEnteredShowIds';
import { useMyEntryBalanceSummary } from '@/features/payments/useMyEntryBalanceSummary';
import { useMyEntriesData } from '@/pages/MyEntriesPage/modules/useMyEntriesData';
import { usePersonIdentity } from '@/context/usePersonIdentity';

const { mockRbacService, mockUseAuth, mockGetUserEntries } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockGetUserEntries: vi.fn(),
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

vi.mock('@/services/database/entries', () => ({
  getUserEntries: mockGetUserEntries,
}));

import { AuthProvider, ProtectedRoute } from '@/context/AuthContext';
import { loadRbacPermissionsCache, saveRbacPermissionsCache } from '@/context/rbacPermissionsCache';
import { loadPersonIdentityCache, savePersonIdentityCache } from '@/context/personIdentityCache';

const renderWithAuthProvider = (children: ReactNode, initialRoute = '/') =>
  renderWithProvider(AuthProvider, children, initialRoute);

describe('AuthContext RBAC lifecycle', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockSupabase.from.mockImplementation(() => createChainableQuery());
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
    mockGetUserEntries.mockReset();
  });

  afterEach(() => {
    onlineManager.setOnline(true);
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

  it('cold boot offline: restores the persisted person id while profile lookup is paused', async () => {
    savePersonIdentityCache(mockUser.id, 'person-cached');
    mockRbacService.getUserPermissions.mockResolvedValue(accessForRole(UserRole.EXHIBITOR));
    const pendingProfile = new Promise<never>(() => {});
    mockSupabase.from.mockImplementation((table: string) =>
      table === 'people'
        ? ({
            select: () => ({
              eq: () => ({ maybeSingle: () => pendingProfile }),
            }),
          } as never)
        : createChainableQuery()
    );

    const TestComponent = () => {
      const auth = useAuthContext();
      return (
        <div>
          <span data-testid="cached-person-id">{auth.userWithRoles?.databaseUserId ?? 'none'}</span>
          <span data-testid="cached-person-state">{auth.personIdentityState}</span>
        </div>
      );
    };

    renderWithAuthProvider(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('cached-person-id')).toHaveTextContent('person-cached');
    });
    expect(screen.getByTestId('cached-person-state')).toHaveTextContent('unresolved');
  });

  it('saves a confirmed profile identity to the account-scoped cache', async () => {
    mockRbacService.getUserPermissions.mockResolvedValue(accessForRole(UserRole.EXHIBITOR));
    mockSupabase.from.mockImplementation((table: string) =>
      table === 'people'
        ? ({
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      id: 'person-live',
                      first_name: 'Live',
                      last_name: 'Profile',
                      email: mockUser.email,
                      status: 'active',
                    },
                    error: null,
                  }),
              }),
            }),
          } as never)
        : createChainableQuery()
    );

    const TestComponent = () => {
      const auth = useAuthContext();
      return <span data-testid="saved-person-id">{auth.personId ?? 'none'}</span>;
    };

    renderWithAuthProvider(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('saved-person-id')).toHaveTextContent('person-live');
      expect(loadPersonIdentityCache(mockUser.id)?.personId).toBe('person-live');
    });
  });

  it('clears the cache when the authoritative profile confirms no person', async () => {
    savePersonIdentityCache(mockUser.id, 'person-stale');
    mockRbacService.getUserPermissions.mockResolvedValue(accessForRole(UserRole.EXHIBITOR));
    mockSupabase.from.mockImplementation((table: string) =>
      table === 'people'
        ? ({
            select: () => ({
              eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
            }),
          } as never)
        : createChainableQuery()
    );

    const TestComponent = () => {
      const auth = useAuthContext();
      return (
        <div>
          <span data-testid="missing-person-id">{auth.personId ?? 'none'}</span>
          <span data-testid="missing-person-state">{auth.personIdentityState}</span>
        </div>
      );
    };

    renderWithAuthProvider(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('missing-person-state')).toHaveTextContent('missing');
      expect(screen.getByTestId('missing-person-id')).toHaveTextContent('none');
      expect(loadPersonIdentityCache(mockUser.id)).toBeNull();
    });
  });

  it('feeds a restored identity through all account entry consumers while offline', async () => {
    savePersonIdentityCache(mockUser.id, 'person-cached');
    // Keep the real profile query paused while the account-level consumers use
    // their replica-capable `networkMode: 'always'` reads below. The provider
    // must restore personId from cache; this test intentionally does not mock
    // AuthContext's identity fields.
    onlineManager.setOnline(false);
    mockRbacService.getUserPermissions.mockResolvedValue(accessForRole(UserRole.EXHIBITOR));
    mockGetUserEntries.mockResolvedValue({
      data: [
        {
          id: 'entry-1',
          show_id: 'show-heartland',
          entry_status: 'accepted',
          check_in_status: null,
          entry_fee: 30,
          payment_status: 'pending',
          show: {
            id: 'show-heartland',
            name: 'Heartland',
            start_date: '2099-10-10',
            end_date: '2099-10-11',
          },
        },
      ],
      error: null,
      source: 'replica-offline',
    });
    const pendingProfile = new Promise<never>(() => {});
    mockSupabase.from.mockImplementation((table: string) =>
      table === 'people'
        ? ({
            select: () => ({
              eq: () => ({ maybeSingle: () => pendingProfile }),
            }),
          } as never)
        : createChainableQuery()
    );

    const TestComponent = () => {
      const auth = useAuthContext();
      const hasAny = useHasAnyEntryForShow('show-heartland');
      const upcoming = useExhibitorUpcomingShows();
      const entered = useAccountEnteredShowIds();
      const balance = useMyEntryBalanceSummary();
      const myEntries = useMyEntriesData({
        persistCheckInStatus: async () => undefined,
      });
      return (
        <div>
          <span data-testid="integration-person-id">
            {auth.userWithRoles?.databaseUserId ?? 'none'}
          </span>
          <span data-testid="integration-identity-state">{auth.personIdentityState}</span>
          <span data-testid="integration-identity-usable">
            {auth.hasUsablePersonId?.toString() ?? 'false'}
          </span>
          <span data-testid="integration-has-entry">{hasAny.hasAnyEntryForShow.toString()}</span>
          <span data-testid="integration-upcoming">{upcoming.upcomingShows.length}</span>
          <span data-testid="integration-entered">{entered.all.length}</span>
          <span data-testid="integration-balance">{balance.data?.kind ?? 'pending'}</span>
          <span data-testid="integration-my-entries">{myEntries.entries.length}</span>
        </div>
      );
    };

    renderWithAuthProvider(<TestComponent />);

    expect(onlineManager.isOnline()).toBe(false);
    await waitFor(() => {
      expect(screen.getByTestId('integration-person-id')).toHaveTextContent('person-cached');
      expect(screen.getByTestId('integration-identity-state')).toHaveTextContent('unresolved');
      expect(screen.getByTestId('integration-identity-usable')).toHaveTextContent('true');
      expect(screen.getByTestId('integration-has-entry')).toHaveTextContent('true');
      expect(screen.getByTestId('integration-upcoming')).toHaveTextContent('1');
      expect(screen.getByTestId('integration-entered')).toHaveTextContent('1');
      expect(screen.getByTestId('integration-balance')).toHaveTextContent('unknown');
      expect(screen.getByTestId('integration-my-entries')).toHaveTextContent('1');
    });
    expect(mockGetUserEntries).toHaveBeenCalledTimes(5);
    expect(mockGetUserEntries).toHaveBeenCalledWith('person-cached');
  });

  it('uses the cached person id before RBAC hydrates without granting a role', async () => {
    savePersonIdentityCache(mockUser.id, 'person-cached');
    mockRbacService.getUserPermissions.mockRejectedValue(new Error('offline'));
    mockGetUserEntries.mockResolvedValue({
      data: [],
      error: null,
      source: 'replica-offline',
    });
    const pendingProfile = new Promise<never>(() => {});
    mockSupabase.from.mockImplementation((table: string) =>
      table === 'people'
        ? ({
            select: () => ({
              eq: () => ({ maybeSingle: () => pendingProfile }),
            }),
          } as never)
        : createChainableQuery()
    );

    const TestComponent = () => {
      const auth = useAuthContext();
      const upcoming = useExhibitorUpcomingShows();
      return (
        <div>
          <span data-testid="rbac-independent-person-id">{auth.personId ?? 'none'}</span>
          <span data-testid="rbac-independent-role">
            {auth.hasRole(UserRole.EXHIBITOR).toString()}
          </span>
          <span data-testid="rbac-independent-read-state">{upcoming.readState}</span>
        </div>
      );
    };

    renderWithAuthProvider(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('rbac-independent-person-id')).toHaveTextContent('person-cached');
      expect(screen.getByTestId('rbac-independent-read-state')).toHaveTextContent('unconfirmed');
      expect(mockGetUserEntries).toHaveBeenCalledWith('person-cached');
    });
    expect(screen.getByTestId('rbac-independent-role')).toHaveTextContent('false');
  });

  it('clears person identity cache on account switch and sign-out', async () => {
    savePersonIdentityCache(mockUser.id, 'person-a');
    const pendingProfile = new Promise<never>(() => {});
    mockSupabase.from.mockImplementation((table: string) =>
      table === 'people'
        ? ({
            select: () => ({
              eq: () => ({ maybeSingle: () => pendingProfile }),
            }),
          } as never)
        : createChainableQuery()
    );

    const TestComponent = () => {
      const auth = useAuthContext();
      return <span data-testid="cache-account">{auth.user?.id ?? 'signed-out'}</span>;
    };
    const view = renderWithAuthProvider(<TestComponent />);

    await waitFor(() => expect(loadPersonIdentityCache(mockUser.id)).not.toBeNull());

    mockUseAuth.mockReturnValue({
      ...mockAuthReturn,
      user: { ...mockUser, id: 'user-b' },
    });
    view.rerender(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('cache-account')).toHaveTextContent('user-b');
      expect(loadPersonIdentityCache(mockUser.id)).toBeNull();
    });

    savePersonIdentityCache('user-b', 'person-b');
    mockUseAuth.mockReturnValue({ ...mockAuthReturn, user: null });
    view.rerender(<TestComponent />);

    await waitFor(() => expect(loadPersonIdentityCache('user-b')).toBeNull());
  });

  it('preserves the current account cache through pre-session boot and transition', async () => {
    savePersonIdentityCache('user-a', 'person-a');
    savePersonIdentityCache('user-b', 'person-b');
    const pendingProfile = new Promise<never>(() => {});
    mockSupabase.from.mockImplementation((table: string) =>
      table === 'people'
        ? ({
            select: () => ({
              eq: () => ({ maybeSingle: () => pendingProfile }),
            }),
          } as never)
        : createChainableQuery()
    );
    mockUseAuth.mockReturnValue({ ...mockAuthReturn, user: null });

    const TestComponent = () => {
      const auth = useAuthContext();
      return <span data-testid="boot-account">{auth.user?.id ?? 'signed-out'}</span>;
    };
    const view = renderWithAuthProvider(<TestComponent />);

    expect(screen.getByTestId('boot-account')).toHaveTextContent('signed-out');

    mockUseAuth.mockReturnValue({
      ...mockAuthReturn,
      user: { ...mockUser, id: 'user-a' },
    });
    view.rerender(<TestComponent />);
    await waitFor(() => expect(screen.getByTestId('boot-account')).toHaveTextContent('user-a'));

    mockUseAuth.mockReturnValue({
      ...mockAuthReturn,
      user: { ...mockUser, id: 'user-b' },
    });
    view.rerender(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('boot-account')).toHaveTextContent('user-b');
      expect(loadPersonIdentityCache('user-a')).toBeNull();
      expect(loadPersonIdentityCache('user-b')?.personId).toBe('person-b');
    });
  });

  it('does not expose account A person data while switching to account B', async () => {
    const profiles: Record<string, { id: string }> = {
      'user-a': { id: 'person-a' },
      'user-b': { id: 'person-b' },
    };
    mockSupabase.from.mockImplementation((table: string) =>
      table === 'people'
        ? ({
            select: () => ({
              eq: (_field: string, authUserId: string) => ({
                maybeSingle: () =>
                  Promise.resolve({ data: profiles[authUserId] ?? null, error: null }),
              }),
            }),
          } as never)
        : createChainableQuery()
    );

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          placeholderData: (previousData: unknown) => previousData,
        },
      },
    });
    const TestComponent = ({ userId }: { userId: string }) => {
      const identity = usePersonIdentity(userId);
      return <span data-testid="switched-person-id">{identity.personId ?? 'none'}</span>;
    };
    const view = render(
      <QueryClientProvider client={queryClient}>
        <TestComponent userId="user-a" />
      </QueryClientProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId('switched-person-id')).toHaveTextContent('person-a')
    );
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <TestComponent userId="user-b" />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('switched-person-id')).not.toHaveTextContent('person-a');
    await waitFor(() =>
      expect(screen.getByTestId('switched-person-id')).toHaveTextContent('person-b')
    );
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

  it('cold boot offline on Safari ("Load failed") also hydrates from cache', async () => {
    saveRbacPermissionsCache(mockUser.id, accessForRole(UserRole.SECRETARY));
    mockRbacService.getUserPermissions.mockRejectedValue(new Error('TypeError: Load failed'));

    const TestComponent = () => {
      const auth = useAuthContext();
      return (
        <span data-testid="safari-roles">{auth.userWithRoles?.roles.join(',') ?? 'none'}</span>
      );
    };

    renderWithAuthProvider(<TestComponent />);

    await waitFor(
      () => {
        expect(screen.getByTestId('safari-roles')).toHaveTextContent(UserRole.SECRETARY);
      },
      { timeout: 5000 }
    );
  });

  it('refreshes cached permissions as soon as the browser comes back online', async () => {
    saveRbacPermissionsCache(mockUser.id, accessForRole(UserRole.SECRETARY));
    mockRbacService.getUserPermissions
      .mockRejectedValueOnce(new Error('TypeError: Failed to fetch'))
      .mockRejectedValueOnce(new Error('TypeError: Failed to fetch'))
      .mockRejectedValueOnce(new Error('TypeError: Failed to fetch'))
      .mockRejectedValueOnce(new Error('TypeError: Failed to fetch'))
      .mockResolvedValueOnce(accessForRole(UserRole.EXHIBITOR));

    const TestComponent = () => {
      const auth = useAuthContext();
      return (
        <div>
          <span data-testid="reconnect-roles">{auth.userWithRoles?.roles.join(',') ?? 'none'}</span>
          <span data-testid="reconnect-from-cache">{auth.rbacFromCacheAt ?? 'live'}</span>
        </div>
      );
    };

    renderWithAuthProvider(<TestComponent />);

    await waitFor(
      () => {
        expect(screen.getByTestId('reconnect-from-cache')).not.toHaveTextContent('live');
      },
      { timeout: 5000 }
    );

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('reconnect-roles')).toHaveTextContent(UserRole.EXHIBITOR);
      expect(screen.getByTestId('reconnect-from-cache')).toHaveTextContent('live');
    });
  });

  it('clears the offline marker when a later refresh fails with a server error', async () => {
    saveRbacPermissionsCache(mockUser.id, accessForRole(UserRole.SECRETARY));
    mockRbacService.getUserPermissions
      .mockRejectedValueOnce(new Error('TypeError: Failed to fetch'))
      .mockRejectedValueOnce(new Error('TypeError: Failed to fetch'))
      .mockRejectedValueOnce(new Error('TypeError: Failed to fetch'))
      .mockRejectedValueOnce(new Error('TypeError: Failed to fetch'))
      .mockRejectedValue(new Error('boom: RPC exploded'));

    const TestComponent = () => {
      const auth = useAuthContext();
      return (
        <div>
          <span data-testid="stale-roles">{auth.userWithRoles?.roles.join(',') ?? 'none'}</span>
          <span data-testid="stale-from-cache">{auth.rbacFromCacheAt ?? 'live'}</span>
          <span data-testid="stale-error">{auth.rbacError ?? 'none'}</span>
        </div>
      );
    };

    renderWithAuthProvider(<TestComponent />);

    await waitFor(
      () => {
        expect(screen.getByTestId('stale-from-cache')).not.toHaveTextContent('live');
      },
      { timeout: 5000 }
    );

    // Server (non-network) failure on reconnect: roles stay, but the state
    // must stop claiming "offline" — the real problem is the backend.
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('stale-error')).not.toHaveTextContent('none');
    });
    expect(screen.getByTestId('stale-roles')).toHaveTextContent(UserRole.SECRETARY);
    expect(screen.getByTestId('stale-from-cache')).toHaveTextContent('live');
  });

  it('clears the offline marker when a manual refresh fails with a server error', async () => {
    saveRbacPermissionsCache(mockUser.id, accessForRole(UserRole.SECRETARY));
    mockRbacService.getUserPermissions
      .mockRejectedValueOnce(new Error('TypeError: Failed to fetch'))
      .mockRejectedValueOnce(new Error('TypeError: Failed to fetch'))
      .mockRejectedValueOnce(new Error('TypeError: Failed to fetch'))
      .mockRejectedValueOnce(new Error('TypeError: Failed to fetch'))
      .mockRejectedValue(new Error('boom: RPC exploded'));

    const TestComponent = () => {
      const auth = useAuthContext();
      return (
        <div>
          <span data-testid="manual-roles">{auth.userWithRoles?.roles.join(',') ?? 'none'}</span>
          <span data-testid="manual-from-cache">{auth.rbacFromCacheAt ?? 'live'}</span>
          <span data-testid="manual-error">{auth.rbacError ?? 'none'}</span>
          <button type="button" onClick={() => void auth.refreshPermissions()}>
            Manual refresh
          </button>
        </div>
      );
    };

    renderWithAuthProvider(<TestComponent />);

    await waitFor(
      () => {
        expect(screen.getByTestId('manual-from-cache')).not.toHaveTextContent('live');
      },
      { timeout: 5000 }
    );

    await userEvent.click(screen.getByRole('button', { name: 'Manual refresh' }));

    await waitFor(() => {
      expect(screen.getByTestId('manual-error')).not.toHaveTextContent('none');
    });
    expect(screen.getByTestId('manual-roles')).toHaveTextContent(UserRole.SECRETARY);
    expect(screen.getByTestId('manual-from-cache')).toHaveTextContent('live');
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
