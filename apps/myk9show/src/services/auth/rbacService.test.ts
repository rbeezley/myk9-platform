import { describe, it, expect, vi, beforeEach } from 'vitest';

// This RBACService (services/auth/rbacService.ts) is a distinct, thinner
// facade than services/rbac/RBACService.ts — it calls RPC functions
// directly ('user_has_permission', 'get_user_permissions', 'get_user_roles',
// 'is_site_admin', 'get_effective_permissions', 'assign_user_role',
// 'revoke_user_role'). Every method's first branch is "no authenticated
// user -> fail closed" and its second is "RPC error -> fail closed" —
// that's the decision table this suite covers.

const getUserMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('../database/supabaseClient', () => ({
  supabase: {
    auth: { getUser: (...args: unknown[]) => getUserMock(...args) },
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

import { RBACService } from './rbacService';

const AUTH_USER = { id: 'auth-user-1' };

beforeEach(() => {
  vi.clearAllMocks();
});

function mockNoUser() {
  getUserMock.mockResolvedValue({ data: { user: null } });
}

function mockUser() {
  getUserMock.mockResolvedValue({ data: { user: AUTH_USER } });
}

describe('RBACService.hasPermission', () => {
  it('no authenticated user -> false, RPC never called', async () => {
    mockNoUser();
    const result = await RBACService.hasPermission('show:create');
    expect(result).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('RPC error -> false (fail closed)', async () => {
    mockUser();
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await RBACService.hasPermission('show:create')).toBe(false);
  });

  it('RPC success -> returns the boolean payload', async () => {
    mockUser();
    rpcMock.mockResolvedValue({ data: true, error: null });
    expect(await RBACService.hasPermission('show:create')).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith('user_has_permission', {
      user_id: AUTH_USER.id,
      permission_name: 'show:create',
      scope_type: undefined,
      scope_id: undefined,
    });
  });
});

describe('RBACService.getUserPermissions', () => {
  it('no authenticated user -> empty array', async () => {
    mockNoUser();
    expect(await RBACService.getUserPermissions()).toEqual([]);
  });

  it('RPC error -> empty array', async () => {
    mockUser();
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await RBACService.getUserPermissions()).toEqual([]);
  });

  it('RPC success -> returns the permission rows', async () => {
    mockUser();
    const rows = [{ permission_name: 'dog:read' }];
    rpcMock.mockResolvedValue({ data: rows, error: null });
    expect(await RBACService.getUserPermissions()).toEqual(rows);
  });
});

describe('RBACService.getUserRoles', () => {
  it('no authenticated user -> empty array', async () => {
    mockNoUser();
    expect(await RBACService.getUserRoles()).toEqual([]);
  });

  it('RPC error -> empty array', async () => {
    mockUser();
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await RBACService.getUserRoles()).toEqual([]);
  });

  it('RPC success -> returns the role rows', async () => {
    mockUser();
    const rows = [{ role_name: 'secretary' }];
    rpcMock.mockResolvedValue({ data: rows, error: null });
    expect(await RBACService.getUserRoles()).toEqual(rows);
  });
});

describe('RBACService.isSiteAdmin', () => {
  it('no authenticated user -> false', async () => {
    mockNoUser();
    expect(await RBACService.isSiteAdmin()).toBe(false);
  });

  it('RPC error -> false', async () => {
    mockUser();
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await RBACService.isSiteAdmin()).toBe(false);
  });

  it('RPC success -> true', async () => {
    mockUser();
    rpcMock.mockResolvedValue({ data: true, error: null });
    expect(await RBACService.isSiteAdmin()).toBe(true);
  });
});

describe('RBACService.getEffectivePermissions', () => {
  it('no authenticated user -> empty array', async () => {
    mockNoUser();
    expect(await RBACService.getEffectivePermissions()).toEqual([]);
  });

  it('RPC error -> empty array', async () => {
    mockUser();
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await RBACService.getEffectivePermissions()).toEqual([]);
  });

  it('RPC success -> maps rows to permission_name strings', async () => {
    mockUser();
    rpcMock.mockResolvedValue({
      data: [{ permission_name: 'show:create' }, { permission_name: 'dog:read' }],
      error: null,
    });
    expect(await RBACService.getEffectivePermissions()).toEqual(['show:create', 'dog:read']);
  });
});

describe('RBACService.assignRole', () => {
  it('no authenticated user -> null, RPC never called', async () => {
    mockNoUser();
    expect(await RBACService.assignRole('target-user', 'secretary')).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('RPC error -> null', async () => {
    mockUser();
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await RBACService.assignRole('target-user', 'secretary')).toBeNull();
  });

  it('RPC success -> returns the new assignment id', async () => {
    mockUser();
    rpcMock.mockResolvedValue({ data: 'assignment-id-1', error: null });
    expect(await RBACService.assignRole('target-user', 'secretary')).toBe('assignment-id-1');
    expect(rpcMock).toHaveBeenCalledWith('assign_user_role', {
      target_user_id: 'target-user',
      role_name: 'secretary',
      scope_type: undefined,
      scope_id: undefined,
      expires_at: undefined,
      assigned_by_user_id: AUTH_USER.id,
    });
  });
});

describe('RBACService.revokeRole', () => {
  it('no authenticated user -> false, RPC never called', async () => {
    mockNoUser();
    expect(await RBACService.revokeRole('target-user', 'secretary')).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('RPC error -> false', async () => {
    mockUser();
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await RBACService.revokeRole('target-user', 'secretary')).toBe(false);
  });

  it('RPC success -> returns true', async () => {
    mockUser();
    rpcMock.mockResolvedValue({ data: true, error: null });
    expect(await RBACService.revokeRole('target-user', 'secretary')).toBe(true);
  });
});
