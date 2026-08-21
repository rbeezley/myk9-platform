import { render, screen } from '@/test/utils/testUtils';
import { vi } from 'vitest';

vi.mock('@/components/admin/permissions/RoleAssignmentsPanel', () => ({
  RoleAssignmentsPanel: () => <div data-testid="role-assignments-panel">Assignments</div>,
}));

vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: {
    getAllRoles: vi.fn().mockResolvedValue([
      {
        id: 'r1',
        name: 'show_secretary',
        description: 'Runs entries, classes, and results',
        is_system: true,
        permissions: null,
        created_at: null,
        display_name: 'Show Secretary',
        permission_count: 37,
        user_count: 14,
      },
    ]),
    getAllPermissions: vi.fn().mockResolvedValue([]),
    getAuditLogs: vi.fn().mockResolvedValue([]),
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

  it('routes to the canonical access surfaces without a duplicate personal role card', async () => {
    render(<PermissionManagementPage />);
    await screen.findByRole('tab', { name: /assignments/i });
    // Carried over verbatim: the Overview must never grow a personal roles card.
    expect(screen.queryByText('Your Active Roles')).not.toBeInTheDocument();
    expect(screen.queryByText('Your Role Grants')).not.toBeInTheDocument();
    // The explainer section is gone; the console itself now shows the roles,
    // and the two management surfaces stay one click away.
    expect(screen.getByRole('link', { name: /assign roles in user management/i })).toHaveAttribute(
      'href',
      '/admin/users'
    );
    expect(screen.getByRole('link', { name: /new role/i })).toHaveAttribute(
      'href',
      '/admin/permissions/roles/new'
    );
  });

  it('uses the visible assignment action label as its accessible name', async () => {
    render(<PermissionManagementPage />);
    const link = await screen.findByRole('link', { name: /assign roles in user management/i });
    expect(link).toHaveAccessibleName('Assign roles in User Management');
  });
});
