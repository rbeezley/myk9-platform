import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoleManager } from './RoleManager';
import { RoleError } from '@/types/rbac-types';
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

  it('inactive assignment exists -> reactivates it, returns true', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'roles') {
        return createChainableQuery({ data: { id: 'role-1' }, error: null });
      }
      if (table === 'user_roles') {
        return createChainableQuery({
          data: [{ id: 'ur-1', is_active: false }],
          error: null,
        });
      }
      return createChainableQuery();
    });

    const { manager, clearUserCache } = buildManager();
    const result = await manager.ensureUserHasRole('user-1', 'secretary');
    expect(result).toBe(true);
    expect(clearUserCache).toHaveBeenCalledWith('user-1');
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
