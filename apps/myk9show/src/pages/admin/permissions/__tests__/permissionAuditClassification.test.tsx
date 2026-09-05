/**
 * MYK9-396 — the audit summary must agree with the rows it summarises.
 *
 * Every action code used here is one a real writer emits: the `ActionType`
 * enum (src/types/rbac-types.ts) or a SQL RPC that inserts into
 * permission_audit_log (supabase/migrations/20260524120000_club_access_requests.sql
 * and friends). `club_secretary_granted` / `club_secretary_revoked` are the
 * codes the old `action.includes('role')` heuristic dropped on the floor.
 */
import { render, screen, within } from '@/test/utils/testUtils';
import { vi } from 'vitest';
import { classifyAuditAction, summarizeAuditActions } from '../permissionAuditClassification';

describe('classifyAuditAction', () => {
  it.each([
    'role_assigned',
    'role_revoked',
    'role_created',
    'role_updated',
    'role_deleted',
    'club_secretary_granted',
    'club_secretary_revoked',
    'club_access_request_approved',
  ])('classifies %s as a role change', action => {
    expect(classifyAuditAction(action)).toBe('role');
  });

  it.each([
    'permission_granted',
    'permission_revoked',
    'permission_created',
    'permission_updated',
    'permission_deleted',
    'permission_override_created',
    'permission_override_removed',
  ])('classifies %s as a permission change', action => {
    expect(classifyAuditAction(action)).toBe('permission');
  });

  it.each(['club_access_request_denied', 'seed_data_created'])(
    'classifies %s as neither role nor permission',
    action => {
      expect(classifyAuditAction(action)).toBe('other');
    }
  );

  it('parks unknown and future action codes in "other" rather than guessing', () => {
    expect(classifyAuditAction('show_secretary_appointed')).toBe('other');
    // Substring-shaped decoys: the old heuristic would have counted these.
    expect(classifyAuditAction('role_map_viewed')).toBe('other');
    expect(classifyAuditAction('permission_matrix_exported')).toBe('other');
    expect(classifyAuditAction('')).toBe('other');
    expect(classifyAuditAction(null)).toBe('other');
  });
});

describe('summarizeAuditActions', () => {
  it('counts a mixed ledger across every family', () => {
    const summary = summarizeAuditActions([
      { action: 'club_secretary_granted' },
      { action: 'club_secretary_revoked' },
      { action: 'role_assigned' },
      { action: 'role_revoked' },
      { action: 'permission_granted' },
      { action: 'club_access_request_denied' },
      { action: 'brand_new_action_nobody_has_mapped' },
    ]);

    expect(summary).toEqual({
      total: 7,
      roleChanges: 4,
      permissionChanges: 1,
      otherChanges: 2,
    });
  });

  it('counts an all-club-secretary ledger as all role changes', () => {
    const logs = Array.from({ length: 8 }, (_, index) => ({
      action: index % 2 === 0 ? 'club_secretary_granted' : 'club_secretary_revoked',
    }));
    expect(summarizeAuditActions(logs)).toEqual({
      total: 8,
      roleChanges: 8,
      permissionChanges: 0,
      otherChanges: 0,
    });
  });

  it('reports zeroes for an empty ledger', () => {
    expect(summarizeAuditActions([])).toEqual({
      total: 0,
      roleChanges: 0,
      permissionChanges: 0,
      otherChanges: 0,
    });
  });
});

const makeLog = (id: string, action: string) => ({
  id,
  action,
  user_id: 'person-1',
  target_type: 'user_role',
  target_id: `assignment-${id}`,
  old_value: null,
  new_value: { role: 'secretary' },
  ip_address: null,
  user_agent: null,
  created_at: new Date(Date.now() - 3600000).toISOString(),
});

const getAuditLogs = vi.fn();

vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: {
    getAuditLogs: (...args: unknown[]) => getAuditLogs(...args),
    clearAllCache: vi.fn(),
    clearUserCache: vi.fn(),
  },
}));

const { default: PermissionAuditPage } = await import('../PermissionAuditPage');

describe('PermissionAuditPage summary', () => {
  it('counts club-secretary appointments as role changes under the default filter', async () => {
    getAuditLogs.mockResolvedValue([
      makeLog('1', 'club_secretary_granted'),
      makeLog('2', 'club_secretary_revoked'),
      makeLog('3', 'club_secretary_granted'),
      makeLog('4', 'club_secretary_revoked'),
      makeLog('5', 'club_secretary_granted'),
      makeLog('6', 'club_secretary_revoked'),
      makeLog('7', 'club_secretary_granted'),
      makeLog('8', 'club_secretary_revoked'),
    ]);

    render(<PermissionAuditPage />);

    // The summary strip sits above the table; find it by its total.
    const total = await screen.findByText('8 changes');
    const strip = total.parentElement as HTMLElement;
    expect(within(strip).getByText('8 role changes')).toBeInTheDocument();
    expect(within(strip).getByText('0 permission changes')).toBeInTheDocument();
  });

  it('summarises a mixed ledger without swallowing unknown codes', async () => {
    getAuditLogs.mockResolvedValue([
      makeLog('1', 'club_secretary_granted'),
      makeLog('2', 'role_assigned'),
      makeLog('3', 'permission_granted'),
      makeLog('4', 'club_access_request_denied'),
    ]);

    render(<PermissionAuditPage />);

    const total = await screen.findByText('4 changes');
    const strip = total.parentElement as HTMLElement;
    expect(within(strip).getByText('2 role changes')).toBeInTheDocument();
    expect(within(strip).getByText('1 permission change')).toBeInTheDocument();
    expect(within(strip).getByText('1 other')).toBeInTheDocument();
  });
});
