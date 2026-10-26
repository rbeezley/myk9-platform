/**
 * MYK9-1409: createRole and updateRole discarded the `error` of the role_permissions delete, the
 * permissions lookup and the insert, then audited success. A failed lookup after the delete left
 * the role with no permissions at all while the page reported the save. Each call must surface its
 * error, unknown codes are refused before any write, and a role is never left holding none of its
 * permissions: the new rows go in first and only then are the others removed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleManager } from './RoleManager';
import { ActionType } from '@/types/rbac-types';
import { mockSupabase, resetMockSupabase } from '@/test/mocks/supabase';
import type { AuditLogger } from './AuditLogger';

type Result = { data: unknown; error: { message: string } | null };

/**
 * Answers each `from(table).<op>(…)…` chain from `responses`, keyed `table.op` by the first method
 * called on the chain, and records those keys in call order.
 */
function scriptSupabase(responses: Record<string, Result>) {
  const calls: string[] = [];
  mockSupabase.from.mockImplementation((table: string) => {
    let op: string | undefined;
    const handler: ProxyHandler<object> = {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (value: Result) => void) =>
            resolve(responses[`${table}.${op}`] ?? { data: null, error: null });
        }
        if (op === undefined && typeof prop === 'string') {
          op = prop;
          calls.push(`${table}.${prop}`);
        }
        return vi.fn(() => new Proxy({}, handler));
      },
    };
    return new Proxy({}, handler);
  });
  return calls;
}

const ROLE = { id: 'role-1', name: 'ring-crew', description: null, is_system: false };
const PERMISSIONS = {
  data: [
    { id: 'p1', code: 'show:view' },
    { id: 'p2', code: 'class:manage' },
  ],
  error: null,
};

function buildManager() {
  const auditLogger = { logAuditEvent: vi.fn() } as unknown as AuditLogger;
  const manager = new RoleManager(auditLogger, vi.fn(), vi.fn());
  return { manager, auditLogger };
}

beforeEach(() => {
  resetMockSupabase();
  vi.clearAllMocks();
});

describe('RoleManager.updateRole permission swap (MYK9-1409)', () => {
  it('rejects when the permissions lookup fails, before deleting anything', async () => {
    const calls = scriptSupabase({
      'roles.select': { data: ROLE, error: null },
      'permissions.select': { data: null, error: { message: 'lookup failed' } },
    });
    const { manager, auditLogger } = buildManager();

    await expect(
      manager.updateRole('role-1', { permissions: ['show:view', 'class:manage'] })
    ).rejects.toThrow(/lookup failed/);
    expect(calls).not.toContain('role_permissions.delete');
    expect(auditLogger.logAuditEvent).not.toHaveBeenCalled();
  });

  it('refuses an unknown permission code without writing', async () => {
    const calls = scriptSupabase({
      'roles.select': { data: ROLE, error: null },
      'permissions.select': PERMISSIONS,
    });
    const { manager, auditLogger } = buildManager();

    await expect(
      manager.updateRole('role-1', { permissions: ['show:view', 'class:manage', 'show:typo'] })
    ).rejects.toThrow(/show:typo/);
    expect(calls.filter(c => c.startsWith('role_permissions.'))).toEqual([]);
    expect(auditLogger.logAuditEvent).not.toHaveBeenCalled();
  });

  it('rejects when adding the new rows fails, and removes none of the old ones', async () => {
    const calls = scriptSupabase({
      'roles.select': { data: ROLE, error: null },
      'permissions.select': PERMISSIONS,
      'role_permissions.upsert': { data: null, error: { message: 'insert failed' } },
    });
    const { manager, auditLogger } = buildManager();

    await expect(
      manager.updateRole('role-1', { permissions: ['show:view', 'class:manage'] })
    ).rejects.toThrow(/insert failed/);
    expect(calls).not.toContain('role_permissions.delete');
    expect(auditLogger.logAuditEvent).not.toHaveBeenCalled();
  });

  it('rejects when removing the old rows fails', async () => {
    scriptSupabase({
      'roles.select': { data: ROLE, error: null },
      'permissions.select': PERMISSIONS,
      'role_permissions.delete': { data: null, error: { message: 'delete failed' } },
    });
    const { manager, auditLogger } = buildManager();

    await expect(manager.updateRole('role-1', { permissions: ['show:view'] })).rejects.toThrow(
      /delete failed/
    );
    expect(auditLogger.logAuditEvent).not.toHaveBeenCalled();
  });

  it('adds before it removes, and audits the permissions actually written', async () => {
    const calls = scriptSupabase({
      'roles.select': { data: ROLE, error: null },
      'permissions.select': PERMISSIONS,
    });
    const { manager, auditLogger } = buildManager();

    await manager.updateRole('role-1', { permissions: ['class:manage', 'show:view'] });

    const writes = calls.filter(c => c.startsWith('role_permissions.'));
    expect(writes).toEqual(['role_permissions.upsert', 'role_permissions.delete']);
    expect(auditLogger.logAuditEvent).toHaveBeenCalledWith(
      ActionType.ROLE_UPDATED,
      expect.objectContaining({
        targetId: 'role-1',
        newValue: expect.objectContaining({ permissions: ['class:manage', 'show:view'] }),
      })
    );
  });

  it('an empty set removes every row and needs no lookup', async () => {
    const calls = scriptSupabase({ 'roles.select': { data: ROLE, error: null } });
    const { manager } = buildManager();

    await manager.updateRole('role-1', { permissions: [] });

    expect(calls).not.toContain('permissions.select');
    expect(calls.filter(c => c.startsWith('role_permissions.'))).toEqual([
      'role_permissions.delete',
    ]);
  });
});

describe('RoleManager.createRole permissions (MYK9-1409)', () => {
  it('rejects when the permissions lookup fails, before creating the role', async () => {
    const calls = scriptSupabase({
      'permissions.select': { data: null, error: { message: 'lookup failed' } },
    });
    const { manager, auditLogger } = buildManager();

    await expect(
      manager.createRole({ name: 'ring-crew', permissions: ['show:view'] } as never)
    ).rejects.toThrow(/lookup failed/);
    expect(calls).not.toContain('roles.insert');
    expect(auditLogger.logAuditEvent).not.toHaveBeenCalled();
  });

  it('rejects when the role_permissions insert fails', async () => {
    scriptSupabase({
      'permissions.select': PERMISSIONS,
      'roles.insert': { data: ROLE, error: null },
      'role_permissions.upsert': { data: null, error: { message: 'insert failed' } },
    });
    const { manager, auditLogger } = buildManager();

    await expect(
      manager.createRole({ name: 'ring-crew', permissions: ['show:view'] } as never)
    ).rejects.toThrow(/insert failed/);
    expect(auditLogger.logAuditEvent).not.toHaveBeenCalled();
  });

  it('audits the count of permissions actually written', async () => {
    scriptSupabase({
      'permissions.select': PERMISSIONS,
      'roles.insert': { data: ROLE, error: null },
    });
    const { manager, auditLogger } = buildManager();

    await manager.createRole({
      name: 'ring-crew',
      permissions: ['show:view', 'class:manage', 'show:view'],
    } as never);

    expect(auditLogger.logAuditEvent).toHaveBeenCalledWith(
      ActionType.ROLE_CREATED,
      expect.objectContaining({
        newValue: expect.objectContaining({ permissions_count: 2 }),
      })
    );
  });
});
