import { render, screen, waitFor } from '@/test/utils/testUtils';
import { vi } from 'vitest';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ roleId: 'role-1' }),
    useNavigate: () => navigateMock,
  };
});

const deleteRoleMock = vi.fn().mockResolvedValue(true);

const customRole = {
  id: 'role-1',
  name: 'ring_steward',
  description: 'Assists at ringside',
  is_system: false,
  permissions: null,
  created_at: null,
  display_name: 'Ring Steward',
  permission_count: 4,
  user_count: 2,
};

const systemRole = {
  ...customRole,
  id: 'role-2',
  name: 'site_admin',
  display_name: 'Site Admin',
  is_system: true,
};

function mockRbacService(role: typeof customRole) {
  vi.doMock('@/services/rbac/RBACService', () => ({
    rbacService: {
      getRole: vi.fn().mockResolvedValue(role),
      getAllPermissions: vi.fn().mockResolvedValue([]),
      getRolePermissions: vi.fn().mockResolvedValue([]),
      updateRolePermissions: vi.fn().mockResolvedValue(true),
      deleteRole: deleteRoleMock,
    },
  }));
}

describe('RoleEditPage — role actions', () => {
  beforeEach(() => {
    vi.resetModules();
    navigateMock.mockClear();
    deleteRoleMock.mockClear();
    deleteRoleMock.mockResolvedValue(true);
  });

  it('offers Delete Role for a custom role', async () => {
    mockRbacService(customRole);
    const { default: RoleEditPage } = await import('../RoleEditPage');
    render(<RoleEditPage />);
    expect(await screen.findByRole('button', { name: /delete role/i })).toBeInTheDocument();
  });

  it('hides Delete Role for a system role — the guard is the point', async () => {
    mockRbacService(systemRole);
    const { default: RoleEditPage } = await import('../RoleEditPage');
    render(<RoleEditPage />);
    // Wait for the page to finish loading before asserting absence.
    await screen.findByText('Role Actions');
    expect(screen.queryByRole('button', { name: /delete role/i })).not.toBeInTheDocument();
  });

  it('links Clone Role at the expected href', async () => {
    mockRbacService(customRole);
    const { default: RoleEditPage } = await import('../RoleEditPage');
    render(<RoleEditPage />);
    const link = await screen.findByRole('link', { name: /clone role/i });
    expect(link).toHaveAttribute('href', '/admin/permissions/roles/role-1/clone');
  });

  it('confirming the dialog calls rbacService.deleteRole with the role id', async () => {
    mockRbacService(customRole);
    const { default: RoleEditPage } = await import('../RoleEditPage');
    const { user } = render(<RoleEditPage />);

    await user.click(await screen.findByRole('button', { name: /delete role/i }));
    await user.click(await screen.findByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(deleteRoleMock).toHaveBeenCalledWith('role-1'));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/admin/permissions'));
  });
});
