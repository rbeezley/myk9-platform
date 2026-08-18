import { render, screen } from '@/test/utils/testUtils';
import { vi } from 'vitest';

vi.mock('@/components/admin/permissions/RoleAssignmentsPanel', () => ({
  RoleAssignmentsPanel: () => <div data-testid="role-assignments-panel">Assignments</div>,
}));

vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: () => ({
    userRoles: [{ id: 'ur-1' }],
    userPermissions: [],
    effectivePermissions: [],
    isLoading: false,
  }),
}));

vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: {
    getAllRoles: vi.fn().mockResolvedValue([]),
    getAllPermissions: vi.fn().mockResolvedValue([]),
    clearAllCache: vi.fn(),
  },
}));

vi.mock('@/components/rbac/RBACMigrationStatus', () => ({
  RBACMigrationStatus: () => null,
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

  it('sends the assign-roles quick action to User Management, not the retired page', async () => {
    render(<PermissionManagementPage />);
    const link = await screen.findByRole('link', { name: /assign user roles/i });
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

  it('keeps the personal role-grant card honest and points it at the ledger', async () => {
    render(<PermissionManagementPage />);
    await screen.findByRole('tab', { name: /assignments/i });
    expect(screen.queryByText('Your Active Roles')).not.toBeInTheDocument();
    expect(screen.getByText('Your Role Grants')).toBeInTheDocument();
  });

  it('gives each quick-action link an accessible name that contains its visible "Get Started" text (WCAG 2.5.3 Label in Name)', async () => {
    render(<PermissionManagementPage />);
    const link = await screen.findByRole('link', { name: /assign user roles/i });
    expect(link).toHaveAccessibleName(/get started/i);
  });
});
