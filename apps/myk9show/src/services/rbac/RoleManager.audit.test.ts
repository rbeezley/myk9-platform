import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionType } from '@/types/rbac-types';
import { createChainableQuery, mockSupabase, resetMockSupabase } from '@/test/mocks/supabase';
import type { AuditLogger } from './AuditLogger';
import { RoleManager } from './RoleManager';

function buildManager() {
  const auditLogger = { logAuditEvent: vi.fn() } as unknown as AuditLogger;
  const manager = new RoleManager(auditLogger, vi.fn(), vi.fn());
  return { manager, auditLogger };
}

beforeEach(() => {
  resetMockSupabase();
  vi.clearAllMocks();
});

describe('RoleManager role assignment audit trail', () => {
  it('logs the target person, role, and show scope after assigning a role', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'people') {
        return createChainableQuery({ data: { id: 'person-1' }, error: null });
      }
      if (table === 'roles') {
        return createChainableQuery({ data: { id: 'role-1' }, error: null });
      }
      if (table === 'user_roles') {
        return createChainableQuery({ data: { id: 'assignment-1' }, error: null });
      }
      return createChainableQuery();
    });

    const { manager, auditLogger } = buildManager();
    await manager.assignRole({
      userId: 'person-1',
      roleName: 'secretary',
      scopeType: 'show',
      scopeId: 'show-1',
    });

    expect(auditLogger.logAuditEvent).toHaveBeenCalledWith(ActionType.ROLE_ASSIGNED, {
      targetId: 'person-1',
      targetType: 'user',
      newValue: {
        role_id: 'role-1',
        role_name: 'secretary',
        club_id: null,
        show_id: 'show-1',
      },
    });
  });

  it('logs no assignment when the user_roles insert fails', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'people') {
        return createChainableQuery({ data: { id: 'person-1' }, error: null });
      }
      if (table === 'roles') {
        return createChainableQuery({ data: { id: 'role-1' }, error: null });
      }
      if (table === 'user_roles') {
        return createChainableQuery({ data: null, error: { message: 'insert failed' } });
      }
      return createChainableQuery();
    });

    const { manager, auditLogger } = buildManager();
    await expect(
      manager.assignRole({ userId: 'person-1', roleName: 'secretary' })
    ).rejects.toThrow('Failed to assign role');
    expect(auditLogger.logAuditEvent).not.toHaveBeenCalled();
  });

  it('logs the target person, role, and club scope after revoking by role name', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'roles') {
        return createChainableQuery({ data: { id: 'role-1' }, error: null });
      }
      if (table === 'user_roles') {
        return createChainableQuery({
          data: [{ club_id: 'club-1', show_id: null }],
          error: null,
        });
      }
      return createChainableQuery();
    });

    const { manager, auditLogger } = buildManager();
    await manager.revokeRole({
      userId: 'person-1',
      roleName: 'secretary',
      scopeType: 'club',
      scopeId: 'club-1',
    });

    expect(auditLogger.logAuditEvent).toHaveBeenCalledWith(ActionType.ROLE_REVOKED, {
      targetId: 'person-1',
      targetType: 'user',
      oldValue: {
        role_id: 'role-1',
        role_name: 'secretary',
        club_id: 'club-1',
        show_id: null,
      },
    });
  });

  it('logs no role-name revocation when the user_roles update fails', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'roles') {
        return createChainableQuery({ data: { id: 'role-1' }, error: null });
      }
      if (table === 'user_roles') {
        return createChainableQuery({ data: null, error: { message: 'update failed' } });
      }
      return createChainableQuery();
    });

    const { manager, auditLogger } = buildManager();
    await expect(
      manager.revokeRole({ userId: 'person-1', roleName: 'secretary' })
    ).rejects.toThrow('Failed to revoke role');
    expect(auditLogger.logAuditEvent).not.toHaveBeenCalled();
  });

  it('logs no role-name revocation when no active assignment is changed', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'roles') {
        return createChainableQuery({ data: { id: 'role-1' }, error: null });
      }
      if (table === 'user_roles') {
        return createChainableQuery({ data: [], error: null });
      }
      return createChainableQuery();
    });

    const { manager, auditLogger } = buildManager();

    await expect(
      manager.revokeRole({ userId: 'person-1', roleName: 'secretary' })
    ).resolves.toBe(false);
    expect(auditLogger.logAuditEvent).not.toHaveBeenCalled();
  });

  it('logs the stored target person, role, and scope after revoking by assignment id', async () => {
    let userRolesCall = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'user_roles') {
        userRolesCall += 1;
        if (userRolesCall === 1) {
          return createChainableQuery({
            data: {
              user_id: 'person-1',
              role_id: 'role-1',
              club_id: null,
              show_id: 'show-1',
              is_active: true,
              role: { name: 'judge' },
            },
            error: null,
          });
        }
        return createChainableQuery({ data: [{ id: 'assignment-1' }], error: null });
      }
      return createChainableQuery();
    });

    const { manager, auditLogger } = buildManager();
    await manager.revokeUserRole('assignment-1');

    expect(auditLogger.logAuditEvent).toHaveBeenCalledWith(ActionType.ROLE_REVOKED, {
      targetId: 'person-1',
      targetType: 'user',
      oldValue: {
        role_id: 'role-1',
        role_name: 'judge',
        club_id: null,
        show_id: 'show-1',
      },
    });
  });

  it('logs no assignment-id revocation when the user_roles update fails', async () => {
    let userRolesCall = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'user_roles') {
        userRolesCall += 1;
        if (userRolesCall === 1) {
          return createChainableQuery({
            data: {
              user_id: 'person-1',
              role_id: 'role-1',
              club_id: 'club-1',
              show_id: null,
              is_active: true,
              role: { name: 'secretary' },
            },
            error: null,
          });
        }
        return createChainableQuery({ data: null, error: { message: 'update failed' } });
      }
      return createChainableQuery();
    });

    const { manager, auditLogger } = buildManager();
    await expect(manager.revokeUserRole('assignment-1')).rejects.toThrow(
      'Failed to revoke user role'
    );
    expect(auditLogger.logAuditEvent).not.toHaveBeenCalled();
  });

  it('does not update or log an assignment-id revocation that is already inactive', async () => {
    const update = vi.fn();
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'user_roles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  user_id: 'person-1',
                  role_id: 'role-1',
                  club_id: null,
                  show_id: null,
                  is_active: false,
                  role: { name: 'secretary' },
                },
                error: null,
              }),
            }),
          }),
          update,
        };
      }
      return createChainableQuery();
    });

    const { manager, auditLogger } = buildManager();
    await manager.revokeUserRole('assignment-1');

    expect(update).not.toHaveBeenCalled();
    expect(auditLogger.logAuditEvent).not.toHaveBeenCalled();
  });

  it('logs no assignment-id revocation when a concurrent revoke wins the update race', async () => {
    let userRolesCall = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'user_roles') {
        userRolesCall += 1;
        if (userRolesCall === 1) {
          return createChainableQuery({
            data: {
              user_id: 'person-1',
              role_id: 'role-1',
              club_id: null,
              show_id: null,
              is_active: true,
              role: { name: 'secretary' },
            },
            error: null,
          });
        }
        return createChainableQuery({ data: [], error: null });
      }
      return createChainableQuery();
    });

    const { manager, auditLogger } = buildManager();
    await manager.revokeUserRole('assignment-1');

    expect(auditLogger.logAuditEvent).not.toHaveBeenCalled();
  });
});
