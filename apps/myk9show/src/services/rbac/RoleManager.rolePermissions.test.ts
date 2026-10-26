/**
 * MYK9-1409: createRole and updateRole discarded the `error` of the role_permissions delete, the
 * permissions lookup and the insert, then audited success. A failed lookup after the delete left
 * the role with no permissions at all while the page reported the save. Each method now makes one
 * RPC that writes the role and its permission set in a single transaction (migration
 * 20261026152300); its error must reach the page, nothing may be audited for a failed write, and
 * the audit must record what the RPC reports it wrote. The transactional behaviour itself is
 * covered by supabase/tests/myk9_1409_role_permission_rpcs_test.sql.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleManager } from './RoleManager';
import { ActionType } from '@/types/rbac-types';
import { mockSupabase, resetMockSupabase } from '@/test/mocks/supabase';
import type { AuditLogger } from './AuditLogger';

const ROLE = {
  id: 'role-1',
  name: 'ring-crew',
  description: 'Ring crew',
  is_system: false,
  permissions: [],
  created_at: '',
};

function buildManager() {
  const auditLogger = { logAuditEvent: vi.fn() } as unknown as AuditLogger;
  const clearAllCache = vi.fn();
  const manager = new RoleManager(auditLogger, vi.fn(), clearAllCache);
  return { manager, auditLogger, clearAllCache };
}

beforeEach(() => {
  resetMockSupabase();
  vi.clearAllMocks();
});

describe('RoleManager.updateRole (MYK9-1409)', () => {
  it('sends the description and permission codes to one RPC', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: { role: ROLE, permission_codes: ['class:manage', 'show:view'] },
      error: null,
    });
    const { manager } = buildManager();

    await manager.updateRole('role-1', {
      description: 'Ring crew',
      permissions: ['class:manage', 'show:view'],
    });

    expect(mockSupabase.rpc).toHaveBeenCalledWith('update_role_with_permissions', {
      p_role_id: 'role-1',
      p_set_description: true,
      p_description: 'Ring crew',
      p_permission_codes: ['class:manage', 'show:view'],
    });
    expect(mockSupabase.from).not.toHaveBeenCalledWith('role_permissions');
  });

  it('leaves the description alone when the request has none', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: { role: ROLE, permission_codes: [] },
      error: null,
    });
    const { manager } = buildManager();

    await manager.updateRole('role-1', { permissions: [] });

    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      'update_role_with_permissions',
      expect.objectContaining({ p_set_description: false, p_permission_codes: [] })
    );
  });

  it('rejects with the server error and audits nothing when the RPC fails', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Unknown permission codes: show:typo' },
    });
    const { manager, auditLogger, clearAllCache } = buildManager();

    await expect(
      manager.updateRole('role-1', { permissions: ['show:view', 'show:typo'] })
    ).rejects.toThrow(/show:typo/);
    expect(auditLogger.logAuditEvent).not.toHaveBeenCalled();
    expect(clearAllCache).not.toHaveBeenCalled();
  });

  it('audits the codes the RPC wrote, targeted at the role, and clears the cache', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: { role: ROLE, permission_codes: ['class:manage', 'show:view'] },
      error: null,
    });
    const { manager, auditLogger, clearAllCache } = buildManager();

    await manager.updateRole('role-1', {
      permissions: ['class:manage', 'show:view', 'class:manage'],
    });

    expect(auditLogger.logAuditEvent).toHaveBeenCalledWith(ActionType.ROLE_UPDATED, {
      targetId: 'role-1',
      targetType: 'role',
      newValue: { permissions: ['class:manage', 'show:view'] },
    });
    expect(clearAllCache).toHaveBeenCalled();
  });

  it('does not audit permissions when the request left them untouched', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: { role: ROLE, permission_codes: null },
      error: null,
    });
    const { manager, auditLogger } = buildManager();

    await manager.updateRole('role-1', { description: 'Ring crew' });

    expect(auditLogger.logAuditEvent).toHaveBeenCalledWith(ActionType.ROLE_UPDATED, {
      targetId: 'role-1',
      targetType: 'role',
      newValue: { description: 'Ring crew' },
    });
  });
});

describe('RoleManager.createRole (MYK9-1409)', () => {
  it('creates the role and its permissions through one RPC', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: { role: ROLE, permission_codes: ['show:view'] },
      error: null,
    });
    const { manager } = buildManager();

    const role = await manager.createRole({
      name: 'ring-crew',
      displayName: 'Ring Crew',
      description: 'Ring crew',
      permissions: ['show:view'],
    });

    expect(mockSupabase.rpc).toHaveBeenCalledWith('create_role_with_permissions', {
      p_name: 'ring-crew',
      p_permission_codes: ['show:view'],
      p_description: 'Ring crew',
    });
    expect(mockSupabase.from).not.toHaveBeenCalledWith('roles');
    expect(role.id).toBe('role-1');
  });

  it('rejects with the server error and audits nothing when the RPC fails', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "roles_name_key"' },
    });
    const { manager, auditLogger } = buildManager();

    await expect(
      manager.createRole({ name: 'ring-crew', displayName: 'Ring Crew', permissions: [] })
    ).rejects.toThrow(/roles_name_key/);
    expect(auditLogger.logAuditEvent).not.toHaveBeenCalled();
  });

  it('audits the count of permissions the RPC wrote', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: { role: ROLE, permission_codes: ['show:view', 'class:manage'] },
      error: null,
    });
    const { manager, auditLogger } = buildManager();

    await manager.createRole({
      name: 'ring-crew',
      displayName: 'Ring Crew',
      permissions: ['show:view', 'class:manage', 'show:view'],
    });

    expect(auditLogger.logAuditEvent).toHaveBeenCalledWith(ActionType.ROLE_CREATED, {
      targetId: 'role-1',
      targetType: 'role',
      newValue: { role_name: 'ring-crew', permissions_count: 2 },
    });
  });
});
