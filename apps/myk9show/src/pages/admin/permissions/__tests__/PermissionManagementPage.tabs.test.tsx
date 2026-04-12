import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';

vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: () => ({
    userRoles: [],
    userPermissions: [],
    effectivePermissions: [],
    isLoading: false,
  }),
}));

vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: {
    getAllRoles: vi.fn().mockResolvedValue([]),
    getAllPermissions: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/components/rbac/RBACMigrationStatus', () => ({
  RBACMigrationStatus: () => <div>Migration Status</div>,
}));

vi.mock('../PermissionAuditPage', () => ({ default: () => <div>Audit Content</div> }));

// Must import AFTER mock setup
const { default: PermissionManagementPage } = await import('../PermissionManagementPage');

describe('PermissionManagementPage tab consolidation', () => {
  it('shows Overview and Permission Audit tabs', () => {
    render(<PermissionManagementPage />, { initialRoute: '/admin/permissions' });
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Permission Audit' })).toBeInTheDocument();
  });

  it('shows Audit content when ?tab=audit', async () => {
    render(<PermissionManagementPage />, { initialRoute: '/admin/permissions?tab=audit' });
    expect(await screen.findByText('Audit Content')).toBeInTheDocument();
  });
});
