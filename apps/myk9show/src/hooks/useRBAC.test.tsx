import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useRBAC, usePermission, useRole, useIsAdmin } from './useRBAC';

vi.mock('./useAuthContext', () => ({
  useAuthContext: vi.fn(),
}));

const { mockRbacService } = vi.hoisted(() => ({
  mockRbacService: {
    setCacheTimeout: vi.fn(),
    getUserPermissions: vi.fn(),
    checkPermission: vi.fn(),
    assignRole: vi.fn(),
    revokeRole: vi.fn(),
    createRole: vi.fn(),
    updateRole: vi.fn(),
    clearUserCache: vi.fn(),
  },
}));

vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: mockRbacService,
}));

import { useAuthContext } from './useAuthContext';

function mockSharedAccessContext(overrides: Record<string, unknown> = {}) {
  const context = {
    user: { id: 'user-1' },
    dbPermissions: ['show:read'],
    rbacUserRoles: [],
    rbacScopedPermissions: [],
    rbacLoading: false,
    rbacError: null,
    rbacLastRefreshed: '2026-07-29T12:00:00.000Z',
    hasPermission: vi.fn((permission: string) => permission === 'show:read'),
    checkPermissionAsync: vi.fn().mockResolvedValue(false),
    refreshPermissions: vi.fn().mockResolvedValue(undefined),
    isAdmin: false,
    ...overrides,
  };
  (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue(context);
  return context;
}

function mockUser(id: string | null) {
  return mockSharedAccessContext({
    user: id ? { id } : null,
    dbPermissions: [],
    hasPermission: vi.fn().mockReturnValue(false),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRbacService.checkPermission.mockResolvedValue(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useRBAC — no user', () => {
  it('returns empty permissions/roles and no admin methods when there is no user', async () => {
    mockUser(null);
    const { result } = renderHook(() => useRBAC());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.userPermissions).toEqual([]);
    expect(result.current.userRoles).toEqual([]);
    expect(result.current.effectivePermissions).toEqual([]);
    // isAdmin gates the admin methods off the returned object entirely
    expect(result.current.assignRole).toBeUndefined();
    expect(result.current.revokeRole).toBeUndefined();
    expect(result.current.createRole).toBeUndefined();
    expect(result.current.updateRole).toBeUndefined();
  });

  it('hasPermission is false for a logged-out user regardless of cache', () => {
    mockUser(null);
    const { result } = renderHook(() => useRBAC());
    expect(result.current.hasPermission('admin:manage')).toBe(false);
  });
});

describe('useRBAC — shared auth-context lifecycle', () => {
  it('reuses auth-context access state without starting another service load', () => {
    mockSharedAccessContext();

    const { result } = renderHook(() => useRBAC());

    expect(result.current.effectivePermissions).toEqual(['show:read']);
    expect(result.current.hasPermission('show:read')).toBe(true);
    expect(result.current.lastRefreshed).toBe('2026-07-29T12:00:00.000Z');
    expect(mockRbacService.getUserPermissions).not.toHaveBeenCalled();
  });

  it('returns async permission results without overriding shared access state', async () => {
    mockSharedAccessContext({
      user: { id: 'user-1' },
      dbPermissions: [],
      hasPermission: vi.fn().mockReturnValue(false),
      checkPermissionAsync: vi.fn().mockResolvedValue(true),
    });
    const { result, rerender } = renderHook(() => useRBAC());

    let granted = false;
    await act(async () => {
      granted = await result.current.checkPermission('admin:manage');
    });
    expect(granted).toBe(true);
    expect(result.current.hasPermission('admin:manage')).toBe(false);

    mockSharedAccessContext({
      user: { id: 'user-2' },
      dbPermissions: [],
      hasPermission: vi.fn().mockReturnValue(false),
    });
    rerender();

    expect(result.current.hasPermission('admin:manage')).toBe(false);
  });

  it('does not let a late async check overwrite refreshed authoritative state', async () => {
    let resolvePermission: ((value: boolean) => void) | undefined;
    mockSharedAccessContext({
      dbPermissions: [],
      rbacLastRefreshed: '2026-07-29T12:00:00.000Z',
      hasPermission: vi.fn().mockReturnValue(false),
      checkPermissionAsync: vi.fn(
        () =>
          new Promise(resolve => {
            resolvePermission = resolve;
          })
      ),
    });
    const { result, rerender } = renderHook(() => useRBAC());

    const pendingCheck = result.current.checkPermission('admin:manage');

    mockSharedAccessContext({
      dbPermissions: [],
      rbacLastRefreshed: '2026-07-29T12:05:00.000Z',
      hasPermission: vi.fn().mockReturnValue(false),
    });
    rerender();

    resolvePermission?.(true);
    await expect(pendingCheck).resolves.toBe(true);
    expect(result.current.hasPermission('admin:manage')).toBe(false);
  });
});

describe('useRBAC — decision table: effectivePermissions -> isAdmin -> admin methods exposed', () => {
  it.each<[string, string[], boolean]>([
    ['no permissions -> not admin, methods hidden', [], false],
    ['non-admin permission only -> not admin', ['dog:read'], false],
    ['admin:manage present -> is admin, methods exposed', ['admin:manage'], true],
    ['admin:manage among others -> is admin', ['dog:read', 'admin:manage', 'show:create'], true],
  ])('%s', async (_label, effectivePermissions, expectedAdmin) => {
    mockSharedAccessContext({
      dbPermissions: effectivePermissions,
      hasPermission: vi.fn((permission: string) => permission === 'admin:manage' && expectedAdmin),
    });

    const { result } = renderHook(() => useRBAC());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(result.current.hasPermission('admin:manage')).toBe(expectedAdmin));

    if (expectedAdmin) {
      expect(result.current.assignRole).toBeInstanceOf(Function);
      expect(result.current.revokeRole).toBeInstanceOf(Function);
      expect(result.current.createRole).toBeInstanceOf(Function);
      expect(result.current.updateRole).toBeInstanceOf(Function);
    } else {
      expect(result.current.assignRole).toBeUndefined();
      expect(result.current.revokeRole).toBeUndefined();
      expect(result.current.createRole).toBeUndefined();
      expect(result.current.updateRole).toBeUndefined();
    }
  });
});

describe('useRBAC — admin-gated mutation methods', () => {
  // Non-admins never see assignRole/revokeRole/createRole/updateRole at all —
  // they're omitted from the returned object (`...(isAdmin ? {...} : {})`),
  // not exposed-but-throwing. Verified above in the isAdmin decision table.
  // For admins, the exposed methods delegate straight to rbacService:
  it('admin: assignRole delegates to rbacService.assignRole', async () => {
    const context = mockSharedAccessContext({
      dbPermissions: ['admin:manage'],
      hasPermission: vi.fn((permission: string) => permission === 'admin:manage'),
    });
    mockRbacService.assignRole.mockResolvedValue('new-assignment-id');

    const { result } = renderHook(() => useRBAC());
    await waitFor(() => expect(result.current.assignRole).toBeInstanceOf(Function));

    await act(async () => {
      await result.current.assignRole?.({ userId: 'target', roleName: 'secretary' });
    });

    expect(mockRbacService.assignRole).toHaveBeenCalledWith({
      userId: 'target',
      roleName: 'secretary',
    });
    expect(context.refreshPermissions).toHaveBeenCalledTimes(1);
  });

  it('admin: revokeRole delegates to rbacService.revokeRole', async () => {
    const context = mockSharedAccessContext({
      dbPermissions: ['admin:manage'],
      hasPermission: vi.fn((permission: string) => permission === 'admin:manage'),
    });
    mockRbacService.revokeRole.mockResolvedValue(true);

    const { result } = renderHook(() => useRBAC());
    await waitFor(() => expect(result.current.revokeRole).toBeInstanceOf(Function));

    await act(async () => {
      await result.current.revokeRole?.({ userId: 'target', roleName: 'secretary' });
    });

    expect(mockRbacService.revokeRole).toHaveBeenCalledWith({
      userId: 'target',
      roleName: 'secretary',
    });
    expect(context.refreshPermissions).toHaveBeenCalledTimes(1);
  });
});

describe('useRBAC — hasPermission cache', () => {
  it('reflects effectivePermissions owned by the auth context', async () => {
    mockSharedAccessContext({
      dbPermissions: ['dog:read', 'show:create'],
      hasPermission: vi.fn((permission: string) =>
        ['dog:read', 'show:create'].includes(permission)
      ),
    });

    const { result } = renderHook(() => useRBAC());

    await waitFor(() => expect(result.current.hasPermission('dog:read')).toBe(true));
    expect(result.current.hasPermission('show:delete')).toBe(false);
  });

  it('checkPermission delegates without replacing the shared access snapshot', async () => {
    const context = mockSharedAccessContext({
      dbPermissions: [],
      hasPermission: vi.fn().mockReturnValue(false),
      checkPermissionAsync: vi.fn().mockResolvedValue(true),
    });

    const { result } = renderHook(() => useRBAC());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Precondition: not in the initial (empty) cache, so hasPermission is false.
    expect(result.current.hasPermission('show:create')).toBe(false);

    let granted: boolean | undefined;
    await act(async () => {
      granted = await result.current.checkPermission('show:create');
    });

    expect(granted).toBe(true);
    expect(context.checkPermissionAsync).toHaveBeenCalledWith('show:create', undefined);
    expect(result.current.hasPermission('show:create')).toBe(false);
  });
});

describe('usePermission', () => {
  it('no user -> hasPermission false, isLoading resolves to false', async () => {
    mockUser(null);
    const { result } = renderHook(() => usePermission('dog:read'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasPermission).toBe(false);
  });

  it('user present -> queries rbacService.checkPermission and reflects the result', async () => {
    mockUser('user-1');
    mockRbacService.checkPermission.mockResolvedValue(true);
    const { result } = renderHook(() => usePermission('dog:read'));
    await waitFor(() => expect(result.current.hasPermission).toBe(true));
  });
});

describe('useRole', () => {
  it('reports hasRole=false when the RBAC role list is empty', async () => {
    mockUser('user-1');
    const { result } = renderHook(() => useRole('secretary'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasRole).toBe(false);
    expect(result.current.roleDetails).toBeNull();
  });

  it('reports hasRole=true for an active matching role', async () => {
    mockSharedAccessContext({
      dbPermissions: [],
      rbacUserRoles: [
        {
          id: 'ur-1',
          user_id: 'user-1',
          role_id: 'role-1',
          club_id: null,
          show_id: null,
          granted_by: null,
          granted_at: null,
          expires_at: null,
          is_active: true,
          role: {
            id: 'role-1',
            name: 'secretary',
            description: null,
            is_system: false,
            permissions: [],
            created_at: null,
          },
        },
      ],
    });

    const { result } = renderHook(() => useRole('secretary'));
    await waitFor(() => expect(result.current.hasRole).toBe(true));
  });
});

describe('useIsAdmin', () => {
  it.each<[string, string[], boolean]>([
    ['no admin permission -> false', ['dog:read'], false],
    ['admin:manage present -> true', ['admin:manage'], true],
  ])('%s', async (_label, effectivePermissions, expected) => {
    mockSharedAccessContext({
      dbPermissions: effectivePermissions,
      hasPermission: vi.fn((permission: string) => permission === 'admin:manage' && expected),
    });

    const { result } = renderHook(() => useIsAdmin());
    await waitFor(() => expect(result.current.isAdmin).toBe(expected));
  });
});
