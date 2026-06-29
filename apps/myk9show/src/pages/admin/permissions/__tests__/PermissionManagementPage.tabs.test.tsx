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

  it('renders the quick-action labels on the overview tab', () => {
    render(<PermissionManagementPage />, { initialRoute: '/admin/permissions' });
    expect(screen.getByRole('heading', { name: 'Manage Roles' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Assign User Roles' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'View Audit Log' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Test Permissions' })).toBeInTheDocument();
  });

  it('uses an en dash (not an em dash) for empty stat counts before they load', () => {
    render(<PermissionManagementPage />, { initialRoute: '/admin/permissions' });
    // Counts resolve to [] async; on first paint the placeholder is shown.
    // The UI-copy ban forbids em dashes — assert the en dash glyph is used.
    const placeholders = screen.getAllByText('–');
    expect(placeholders.length).toBeGreaterThan(0);
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });
});
