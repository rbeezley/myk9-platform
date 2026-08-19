import { render, screen } from '@/test/utils/testUtils';
import { vi } from 'vitest';

vi.mock('@/components/admin/permissions/RoleAssignmentsPanel', () => ({
  RoleAssignmentsPanel: () => <div data-testid="role-assignments-panel">Assignments</div>,
}));

vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: {
    getAllRoles: vi.fn().mockResolvedValue([]),
    getAllPermissions: vi.fn().mockResolvedValue([]),
    clearAllCache: vi.fn(),
  },
}));

vi.mock('../PermissionAuditPage', () => ({
  default: () => null,
}));

const { default: PermissionManagementPage } = await import('../PermissionManagementPage');

describe('PermissionManagementPage — assignments tab', () => {
  it('offers an Assignments tab', async () => {
    render(<PermissionManagementPage />);
    expect(await screen.findByRole('tab', { name: /assignments/i })).toBeInTheDocument();
  });

  it('renders the assignments panel when that tab is selected', async () => {
    const { user } = render(<PermissionManagementPage />);
    await user.click(await screen.findByRole('tab', { name: /assignments/i }));
    expect(await screen.findByTestId('role-assignments-panel')).toBeInTheDocument();
  });

  it('sends the primary assign-roles action to User Management, not the retired page', async () => {
    render(<PermissionManagementPage />);
    const link = await screen.findByRole('link', { name: /assign roles in user management/i });
    expect(link).toHaveAttribute('href', '/admin/users');
  });

  it('no longer links anywhere at /admin/permissions/users', async () => {
    render(<PermissionManagementPage />);
    await screen.findByRole('tab', { name: /assignments/i });
    const stale = screen
      .getAllByRole('link')
      .filter(a => a.getAttribute('href')?.startsWith('/admin/permissions/users'));
    expect(stale).toEqual([]);
  });

  it('explains the canonical access workflow without a duplicate personal role card', async () => {
    render(<PermissionManagementPage />);
    await screen.findByRole('tab', { name: /assignments/i });
    expect(screen.queryByText('Your Active Roles')).not.toBeInTheDocument();
    expect(screen.queryByText('Your Role Grants')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /how access works/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /assign access/i })).toBeInTheDocument();
  });

  it('uses the visible assignment action label as its accessible name', async () => {
    render(<PermissionManagementPage />);
    const link = await screen.findByRole('link', { name: /assign roles in user management/i });
    expect(link).toHaveAccessibleName('Assign roles in User Management');
  });
});
