import { render, screen, within } from '@/test/utils/testUtils';
import { vi } from 'vitest';

vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: {
    getAllUserRoles: vi.fn().mockResolvedValue([
      {
        id: 'ur-1',
        user_id: 'user-111',
        role_id: 'role-1',
        club_id: null,
        show_id: null,
        granted_by: 'admin-1',
        granted_at: '2026-01-15T10:00:00Z',
        expires_at: null,
        is_active: true,
        scope_type: 'global',
        scope_id: null,
        user_email: 'alice@example.com',
        role: {
          id: 'role-1',
          name: 'secretary',
          display_name: 'Secretary',
          description: 'Show secretary',
          is_system: true,
          permissions: null,
          created_at: null,
        },
        assigned_by_email: 'admin@example.com',
      },
      {
        id: 'ur-2',
        user_id: 'user-222',
        role_id: 'role-2',
        club_id: 'club-1',
        show_id: null,
        granted_by: 'admin-1',
        granted_at: '2026-02-20T14:30:00Z',
        expires_at: '2026-12-31T23:59:59Z',
        is_active: false,
        scope_type: 'club',
        scope_id: 'club-1',
        user_email: 'bob@example.com',
        role: {
          id: 'role-2',
          name: 'judge',
          display_name: 'Judge',
          description: 'Trial judge',
          is_system: true,
          permissions: null,
          created_at: null,
        },
        assigned_by_email: 'admin@example.com',
      },
    ]),
    getAllRoles: vi.fn().mockResolvedValue([
      {
        id: 'role-1',
        name: 'secretary',
        display_name: 'Secretary',
        description: 'Show secretary',
        is_system: true,
        permissions: null,
        created_at: null,
      },
      {
        id: 'role-2',
        name: 'judge',
        display_name: 'Judge',
        description: 'Trial judge',
        is_system: true,
        permissions: null,
        created_at: null,
      },
    ]),
    revokeUserRole: vi.fn().mockResolvedValue(undefined),
    assignRole: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { default: UserRoleManagementPage } = await import('../UserRoleManagementPage');

describe('UserRoleManagementPage DataTable migration', () => {
  it('renders sortable column headers in assignments tab', async () => {
    render(<UserRoleManagementPage />);
    const table = await screen.findByRole('table');
    const headers = within(table).getAllByRole('columnheader');
    const headerTexts = headers.map(h => h.textContent ?? '');
    expect(headerTexts.some(t => t.startsWith('User'))).toBe(true);
    expect(headerTexts.some(t => t.startsWith('Role'))).toBe(true);
    expect(headerTexts.some(t => t.startsWith('Status'))).toBe(true);
  });

  it('renders search input', async () => {
    render(<UserRoleManagementPage />);
    await screen.findByRole('table');
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it('renders column visibility toggle', async () => {
    render(<UserRoleManagementPage />);
    await screen.findByRole('table');
    expect(screen.getByRole('button', { name: /toggle columns/i })).toBeInTheDocument();
  });

  it('renders user email in rows', async () => {
    render(<UserRoleManagementPage />);
    await screen.findByRole('table');
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
  });

  it('renders revoke action dropdown', async () => {
    render(<UserRoleManagementPage />);
    await screen.findByRole('table');
    // Actions column has a dropdown trigger button (MoreHorizontal icon)
    const actionBtns = screen.getAllByRole('button').filter(btn => {
      const sr = btn.querySelector('.sr-only');
      return sr?.textContent === 'Open menu' || btn.querySelector('svg.lucide-ellipsis');
    });
    expect(actionBtns.length).toBeGreaterThan(0);
  });

  it('renders Active and Inactive status badges', async () => {
    render(<UserRoleManagementPage />);
    await screen.findByRole('table');
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('renders Assign Role button', async () => {
    render(<UserRoleManagementPage />);
    await screen.findByRole('table');
    expect(screen.getByRole('button', { name: /assign role/i })).toBeInTheDocument();
  });
});
