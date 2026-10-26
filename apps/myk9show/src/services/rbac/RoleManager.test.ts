import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoleManager } from './RoleManager';
import { ActionType, RoleError } from '@/types/rbac-types';
import { mockSupabase, createChainableQuery, resetMockSupabase } from '@/test/mocks/supabase';
import type { AuditLogger } from './AuditLogger';

// RoleManager reads/writes via the module-level `supabase` client, which is
// globally mocked to `mockSupabase` in src/test/setup.ts (@/lib/supabase).

function buildManager() {
  const auditLogger = { logAuditEvent: vi.fn() } as unknown as AuditLogger;
  const clearUserCache = vi.fn();
  const clearAllCache = vi.fn();
  const manager = new RoleManager(auditLogger, clearUserCache, clearAllCache);
  return { manager, auditLogger, clearUserCache, clearAllCache };
}

beforeEach(() => {
  resetMockSupabase();
  vi.clearAllMocks();
});

describe('RoleManager.assignRole — userId validation', () => {
  it('rejects when userId does not match a people.id row', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'people') {
        return createChainableQuery({ data: null, error: null }); // maybeSingle -> no match
      }
      return createChainableQuery();
    });

    const { manager } = buildManager();

    await expect(
      manager.assignRole({ userId: 'not-a-people-id', roleName: 'secretary' })
    ).rejects.toThrow(RoleError);
  });
});

/**
 * Decision table: existing-assignment state -> ensureUserHasRole outcome.
 * Derived directly from services/rbac/RoleManager.ts#ensureUserHasRole.
 */
describe('RoleManager.ensureUserHasRole', () => {
  it('role name not found in roles table -> false, no assignment attempted', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'roles') {
        return createChainableQuery({ data: null, error: { message: 'not found' } });
      }
      return createChainableQuery();
    });

    const { manager } = buildManager();
    const result = await manager.ensureUserHasRole('user-1', 'nonexistent-role');
    expect(result).toBe(false);
  });

  it('active assignment already exists -> false (no-op)', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'roles') {
        return createChainableQuery({ data: { id: 'role-1' }, error: null });
      }
      if (table === 'user_roles') {
        return createChainableQuery({
          data: [{ id: 'ur-1', is_active: true }],
          error: null,
        });
      }
      return createChainableQuery();
    });

    const { manager, clearUserCache } = buildManager();
    const result = await manager.ensureUserHasRole('user-1', 'secretary');
    expect(result).toBe(false);
    expect(clearUserCache).not.toHaveBeenCalled();
  });

  it('inactive assignment exists -> reactivates it with is_active:true, returns true', async () => {
    // Share one chainable query for user_roles so both the select and the
    // reactivation update run through the same captured `.update`/`.eq` mocks.
    const userRolesQuery = createChainableQuery({
      data: [{ id: 'ur-1', is_active: false }],
      error: null,
    });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'roles') {
        return createChainableQuery({ data: { id: 'role-1' }, error: null });
      }
      if (table === 'user_roles') {
        return userRolesQuery;
      }
      return createChainableQuery();
    });

    const { manager, auditLogger, clearUserCache } = buildManager();
    const result = await manager.ensureUserHasRole('user-1', 'secretary');
    expect(result).toBe(true);
    expect(clearUserCache).toHaveBeenCalledWith('user-1');
    // The reactivation must set is_active:true and target the existing row id.
    expect(userRolesQuery.update).toHaveBeenCalledWith({ is_active: true });
    expect(userRolesQuery.eq).toHaveBeenCalledWith('id', 'ur-1');
    expect(userRolesQuery.eq).toHaveBeenCalledWith('is_active', false);
    expect(auditLogger.logAuditEvent).toHaveBeenCalledWith(ActionType.ROLE_ASSIGNED, {
      targetId: 'user-1',
      targetType: 'user',
      newValue: {
        role_id: 'role-1',
        role_name: 'secretary',
        club_id: null,
        show_id: null,
      },
    });
  });

  it('concurrent reactivation returns false and logs nothing when no inactive row is changed', async () => {
    let userRolesCall = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'roles') {
        return createChainableQuery({ data: { id: 'role-1' }, error: null });
      }
      if (table === 'user_roles') {
        userRolesCall += 1;
        if (userRolesCall === 1) {
          return createChainableQuery({
            data: [{ id: 'ur-1', is_active: false }],
            error: null,
          });
        }
        return createChainableQuery({ data: null, error: null });
      }
      return createChainableQuery();
    });

    const { manager, auditLogger, clearUserCache } = buildManager();
    const result = await manager.ensureUserHasRole('user-1', 'secretary');

    expect(result).toBe(false);
    expect(auditLogger.logAuditEvent).not.toHaveBeenCalled();
    expect(clearUserCache).not.toHaveBeenCalled();
  });

  it('no existing assignment -> grants a new role, returns true', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'roles') {
        return createChainableQuery({ data: { id: 'role-1' }, error: null });
      }
      if (table === 'user_roles') {
        return createChainableQuery({ data: [], error: null });
      }
      if (table === 'people') {
        return createChainableQuery({ data: { id: 'user-1' }, error: null });
      }
      return createChainableQuery();
    });
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const { manager, clearUserCache } = buildManager();
    const result = await manager.ensureUserHasRole('user-1', 'secretary');
    expect(result).toBe(true);
    expect(clearUserCache).toHaveBeenCalledWith('user-1');
  });
});

describe('RoleManager.getAllRoles — Members column counts distinct people', () => {
  const roleRows = [
    {
      id: 'role-1',
      name: 'secretary',
      description: null,
      is_system: false,
      permissions: [],
      created_at: null,
    },
    {
      id: 'role-2',
      name: 'judge',
      description: null,
      is_system: false,
      permissions: [],
      created_at: null,
    },
  ];

  it('counts a person once per role even when they hold it via several grant rows (e.g. multiple shows)', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'roles') {
        return createChainableQuery({ data: roleRows, error: null });
      }
      if (table === 'role_permissions') {
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'user_roles') {
        // person-1 holds role-1 via three separate grant rows (three shows).
        // A row-count would report 3 "Members"; the fix must report 1.
        return {
          select: vi.fn().mockResolvedValue({
            data: [
              { role_id: 'role-1', user_id: 'person-1', is_active: true },
              { role_id: 'role-1', user_id: 'person-1', is_active: true },
              { role_id: 'role-1', user_id: 'person-1', is_active: true },
              { role_id: 'role-1', user_id: 'person-2', is_active: true },
              { role_id: 'role-2', user_id: 'person-3', is_active: true },
            ],
            error: null,
          }),
        };
      }
      return createChainableQuery();
    });

    const { manager } = buildManager();
    const roles = await manager.getAllRoles();

    const role1 = roles.find(r => r.id === 'role-1');
    const role2 = roles.find(r => r.id === 'role-2');
    expect(role1?.user_count).toBe(2); // person-1 + person-2, not 4 rows
    expect(role2?.user_count).toBe(1);
  });

  it('excludes inactive grants from the distinct-user count', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'roles') {
        return createChainableQuery({ data: [roleRows[0]], error: null });
      }
      if (table === 'role_permissions') {
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'user_roles') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [
              { role_id: 'role-1', user_id: 'person-1', is_active: true },
              { role_id: 'role-1', user_id: 'person-2', is_active: false },
            ],
            error: null,
          }),
        };
      }
      return createChainableQuery();
    });

    const { manager } = buildManager();
    const roles = await manager.getAllRoles();

    expect(roles.find(r => r.id === 'role-1')?.user_count).toBe(1);
  });

  it('reports 0 members for a role with no grant rows', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'roles') {
        return createChainableQuery({ data: [roleRows[1]], error: null });
      }
      if (table === 'role_permissions') {
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'user_roles') {
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      }
      return createChainableQuery();
    });

    const { manager } = buildManager();
    const roles = await manager.getAllRoles();

    expect(roles.find(r => r.id === 'role-2')?.user_count).toBe(0);
  });
});

describe('RoleManager.getAllUserRoles — scope identity', () => {
  it('requests and maps the exact club identity for a club-scoped assignment', async () => {
    const assignmentsQuery = createChainableQuery({
      data: [
        {
          id: 'assignment-1',
          user_id: 'person-1',
          role_id: 'role-1',
          club_id: 'club-1',
          show_id: null,
          granted_by: 'admin-1',
          granted_at: '2026-08-21T12:00:00Z',
          expires_at: null,
          is_active: true,
          role: {
            id: 'role-1',
            name: 'secretary',
            description: null,
            is_system: true,
            permissions: null,
            created_at: null,
          },
          club: { id: 'club-1', name: 'Blue Ridge Kennel Club' },
        },
      ],
      error: null,
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'user_roles') return assignmentsQuery;
      if (table === 'people') {
        return createChainableQuery({
          data: [
            {
              id: 'person-1',
              first_name: 'Alice',
              last_name: 'Admin',
              email: 'alice@example.com',
            },
            {
              id: 'admin-1',
              first_name: 'Site',
              last_name: 'Admin',
              email: 'admin@example.com',
            },
          ],
          error: null,
        });
      }
      return createChainableQuery();
    });

    const { manager } = buildManager();
    const assignments = await manager.getAllUserRoles();

    expect(assignmentsQuery.select).toHaveBeenCalledWith(expect.stringContaining('club:clubs'));
    expect(assignments[0]?.club).toEqual({
      id: 'club-1',
      name: 'Blue Ridge Kennel Club',
    });
  });
});
