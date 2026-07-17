import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useRBAC, usePermission, useRole, useIsAdmin } from './useRBAC';
import type { UserPermissionsResponse } from '@/types/rbac-types';

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

const NO_PERMISSIONS: UserPermissionsResponse = {
  permissions: [],
  roles: [],
  effectivePermissions: [],
};

function mockUser(id: string | null) {
  (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
    user: id ? { id } : null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRbacService.getUserPermissions.mockResolvedValue(NO_PERMISSIONS);
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

describe('useRBAC — decision table: effectivePermissions -> isAdmin -> admin methods exposed', () => {
  it.each<[string, string[], boolean]>([
    ['no permissions -> not admin, methods hidden', [], false],
    ['non-admin permission only -> not admin', ['dog:read'], false],
    ['admin:manage present -> is admin, methods exposed', ['admin:manage'], true],
    ['admin:manage among others -> is admin', ['dog:read', 'admin:manage', 'show:create'], true],
  ])('%s', async (_label, effectivePermissions, expectedAdmin) => {
    mockUser('user-1');
    mockRbacService.getUserPermissions.mockResolvedValue({
      permissions: [],
      roles: [],
      effectivePermissions,
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
    mockUser('user-1');
    mockRbacService.getUserPermissions.mockResolvedValue({
      permissions: [],
      roles: [],
      effectivePermissions: ['admin:manage'],
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
  });

  it('admin: revokeRole delegates to rbacService.revokeRole', async () => {
    mockUser('user-1');
    mockRbacService.getUserPermissions.mockResolvedValue({
      permissions: [],
      roles: [],
      effectivePermissions: ['admin:manage'],
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
  });
});

describe('useRBAC — hasPermission cache', () => {
  it('reflects effectivePermissions loaded from the service after settling', async () => {
    mockUser('user-1');
    mockRbacService.getUserPermissions.mockResolvedValue({
      permissions: [],
      roles: [],
      effectivePermissions: ['dog:read', 'show:create'],
    });

    const { result } = renderHook(() => useRBAC());

    await waitFor(() => expect(result.current.hasPermission('dog:read')).toBe(true));
    expect(result.current.hasPermission('show:delete')).toBe(false);
  });

  it('checkPermission queries the service and updates the cache', async () => {
    mockUser('user-1');
    mockRbacService.checkPermission.mockResolvedValue(true);

    const { result } = renderHook(() => useRBAC());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Precondition: not in the initial (empty) cache, so hasPermission is false.
    expect(result.current.hasPermission('show:create')).toBe(false);

    let granted: boolean | undefined;
    await act(async () => {
      granted = await result.current.checkPermission('show:create');
    });

    expect(granted).toBe(true);
    expect(mockRbacService.checkPermission).toHaveBeenCalledWith(
      'user-1',
      'show:create',
      undefined
    );
    // The awaited check must have populated permissionCache so the synchronous
    // hasPermission now returns true. Fails if checkPermission stops caching.
    await waitFor(() => expect(result.current.hasPermission('show:create')).toBe(true));
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
    mockUser('user-1');
    mockRbacService.getUserPermissions.mockResolvedValue({
      permissions: [],
      roles: [
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
      effectivePermissions: [],
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
    mockUser('user-1');
    mockRbacService.getUserPermissions.mockResolvedValue({
      permissions: [],
      roles: [],
      effectivePermissions,
    });

    const { result } = renderHook(() => useIsAdmin());
    await waitFor(() => expect(result.current.isAdmin).toBe(expected));
  });
});
