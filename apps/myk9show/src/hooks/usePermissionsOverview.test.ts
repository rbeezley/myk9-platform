import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePermissionsOverview } from './usePermissionsOverview';
import { rbacService } from '@/services/rbac/RBACService';
import type { AuditLogEntry, Role, Permission } from '@/types/rbac-types';

vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: {
    getAllRoles: vi.fn(),
    getAllPermissions: vi.fn(),
    getAuditLogs: vi.fn(),
  },
}));

const mockedRbacService = vi.mocked(rbacService);

const roleEntry: AuditLogEntry = {
  id: 'audit-1',
  action: 'role_updated',
  user_id: 'people-1',
  target_id: 'role-1',
  target_type: 'role',
  old_value: null,
  new_value: null,
  ip_address: null,
  user_agent: null,
  created_at: '2026-08-01T00:00:00Z',
};

const userGrantEntry: AuditLogEntry = {
  id: 'audit-2',
  action: 'role_assigned',
  user_id: 'people-2',
  target_id: 'user-1',
  target_type: 'user',
  old_value: null,
  new_value: null,
  ip_address: null,
  user_agent: null,
  created_at: '2026-08-02T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedRbacService.getAllRoles.mockResolvedValue([] as Role[]);
  mockedRbacService.getAllPermissions.mockResolvedValue([] as Permission[]);
});

describe('usePermissionsOverview — audit query shape', () => {
  it('requests a role-targeted query for the roles table and an unfiltered query for the rail', async () => {
    mockedRbacService.getAuditLogs.mockResolvedValue([]);

    renderHook(() => usePermissionsOverview());

    await waitFor(() => {
      expect(mockedRbacService.getAuditLogs).toHaveBeenCalledTimes(2);
    });

    const calls = mockedRbacService.getAuditLogs.mock.calls.map(call => call[0]);
    // One call is unfiltered (the rail wants ALL recent access changes)...
    expect(calls).toContainEqual(expect.objectContaining({ limit: expect.any(Number) }));
    const unfilteredCall = calls.find(call => !('targetType' in (call ?? {})));
    expect(unfilteredCall).toBeDefined();
    // ...and the other is filtered to roles (feeds "Last changed").
    const roleFilteredCall = calls.find(call => call?.targetType === 'role');
    expect(roleFilteredCall).toBeDefined();
  });

  it('feeds the rail (auditEntries) the unfiltered results and lastChanged only role-targeted results', async () => {
    mockedRbacService.getAuditLogs.mockImplementation(async filter => {
      if (filter?.targetType === 'role') return [roleEntry];
      return [roleEntry, userGrantEntry];
    });

    const { result } = renderHook(() => usePermissionsOverview());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // The rail is not narrowed: it still sees the non-role event.
    expect(result.current.auditEntries).toHaveLength(2);
    expect(result.current.auditEntries).toContainEqual(userGrantEntry);

    // "Last changed" is derived only from role-targeted entries.
    expect(result.current.lastChanged.get('role-1')).toBe('2026-08-01T00:00:00Z');
    expect(result.current.lastChanged.get('user-1')).toBeUndefined();
  });

  it('a role edit does not age out of "Last changed" once 200 unrelated grant events accumulate', async () => {
    const manyUserGrants: AuditLogEntry[] = Array.from({ length: 200 }, (_, i) => ({
      ...userGrantEntry,
      id: `grant-${i}`,
      created_at: '2026-08-10T00:00:00Z',
    }));

    mockedRbacService.getAuditLogs.mockImplementation(async filter => {
      if (filter?.targetType === 'role') return [roleEntry];
      // Simulate the unfiltered feed being dominated by 200 newer grant rows.
      return [...manyUserGrants, roleEntry];
    });

    const { result } = renderHook(() => usePermissionsOverview());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.lastChanged.get('role-1')).toBe('2026-08-01T00:00:00Z');
  });
});

/**
 * Regression coverage: a single shared `auditFailed` flag used to collapse
 * the two independent audit reads together, so a failure in one query made
 * the OTHER query's consumer falsely claim it failed too. Each read must
 * report its own failure to its own consumer only.
 */
describe('usePermissionsOverview — independent audit failure flags', () => {
  it('a role-targeted query failure sets roleAuditFailed but not auditFailed (rail unaffected)', async () => {
    mockedRbacService.getAuditLogs.mockImplementation(async filter => {
      if (filter?.targetType === 'role') {
        throw new Error('role-targeted audit read failed');
      }
      return [userGrantEntry];
    });

    const { result } = renderHook(() => usePermissionsOverview());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.roleAuditFailed).toBe(true);
    expect(result.current.auditFailed).toBe(false);
    // The rail's data still loaded successfully and must not be discarded.
    expect(result.current.auditEntries).toEqual([userGrantEntry]);
    expect(result.current.error).toBeNull();
  });

  it('an unfiltered query failure sets auditFailed but not roleAuditFailed (Last changed unaffected)', async () => {
    mockedRbacService.getAuditLogs.mockImplementation(async filter => {
      if (filter?.targetType === 'role') {
        return [roleEntry];
      }
      throw new Error('unfiltered audit read failed');
    });

    const { result } = renderHook(() => usePermissionsOverview());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.auditFailed).toBe(true);
    expect(result.current.roleAuditFailed).toBe(false);
    // "Last changed" still derives from the successful role-targeted read.
    expect(result.current.lastChanged.get('role-1')).toBe('2026-08-01T00:00:00Z');
    expect(result.current.error).toBeNull();
  });
});
