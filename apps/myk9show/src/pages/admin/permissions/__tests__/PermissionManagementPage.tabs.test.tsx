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
    getAllPermissions: vi.fn().mockResolvedValue([
      {
        id: 'p1',
        code: 'show:manage',
        name: 'Manage Shows',
        description: 'Full control over shows',
        category: null,
        created_at: null,
      },
    ]),
    clearAllCache: vi.fn(),
    clearUserCache: vi.fn(),
  },
}));

vi.mock('../PermissionAuditPage', () => ({ default: () => <div>Audit Content</div> }));

// Must import AFTER mock setup
const { default: PermissionManagementPage } = await import('../PermissionManagementPage');

describe('PermissionManagementPage tab consolidation', () => {
  it('shows Overview, Permissions, and Permission Audit tabs', () => {
    render(<PermissionManagementPage />, { initialRoute: '/admin/permissions' });
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Permissions' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Permission Audit' })).toBeInTheDocument();
  });

  it('shows Audit content when ?tab=audit', async () => {
    render(<PermissionManagementPage />, { initialRoute: '/admin/permissions?tab=audit' });
    expect(await screen.findByText('Audit Content')).toBeInTheDocument();
  });

  it('renders the permission inventory when ?tab=permissions', async () => {
    const { user } = render(<PermissionManagementPage />, {
      initialRoute: '/admin/permissions?tab=permissions',
    });
    await user.click(await screen.findByRole('button', { name: /show 1 permission/i }));
    expect(await screen.findByText('Manage Shows')).toBeInTheDocument();
    expect(screen.getByText('show:manage')).toBeInTheDocument();
  });

  it('links the Total Permissions stat to the inventory tab, not the roles list', async () => {
    const { container } = render(<PermissionManagementPage />, {
      initialRoute: '/admin/permissions',
    });
    // Wait for the async permission count to resolve so the stat card is rendered.
    await screen.findByText('Total Permissions');
    const inventoryLinks = container.querySelectorAll(
      'a[href="/admin/permissions?tab=permissions"]'
    );
    expect(inventoryLinks.length).toBe(1);
  });

  it('keeps the overview focused on the two places where access is managed', () => {
    render(<PermissionManagementPage />, { initialRoute: '/admin/permissions' });
    expect(screen.getByRole('link', { name: 'Manage roles' })).toHaveAttribute(
      'href',
      '/admin/permissions/roles'
    );
    expect(screen.getByRole('link', { name: 'Assign roles in User Management' })).toHaveAttribute(
      'href',
      '/admin/users'
    );
  });

  it('does not expose completed migration or debug tools in the routine admin path', () => {
    render(<PermissionManagementPage />, { initialRoute: '/admin/permissions' });
    expect(screen.queryByText(/migration complete/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/debug permission/i)).not.toBeInTheDocument();
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
