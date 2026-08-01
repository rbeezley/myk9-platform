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
        user_email: 'bob@example.com',
        role: {
          id: 'role-2',
          name: 'judge',
          display_name: null,
          description: 'Trial judge',
          is_system: true,
          permissions: null,
          created_at: null,
        },
        assigned_by_email: 'admin@example.com',
      },
      {
        id: 'ur-3',
        user_id: 'missing-user',
        role_id: 'missing-role',
        club_id: null,
        show_id: null,
        granted_by: null,
        granted_at: '2026-03-20T14:30:00Z',
        expires_at: null,
        is_active: true,
      },
      {
        id: 'ur-4',
        user_id: 'user-333',
        role_id: 'role-1',
        club_id: null,
        show_id: 'show-9',
        granted_by: 'admin-1',
        granted_at: '2026-04-01T10:00:00Z',
        expires_at: null,
        is_active: true,
        user_email: 'carol@example.com',
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
        description: 'Trial judge',
        is_system: true,
        permissions: null,
        created_at: null,
      },
    ]),
    revokeUserRole: vi.fn().mockResolvedValue(undefined),
    assignRole: vi.fn().mockResolvedValue(undefined),
    clearAllCache: vi.fn(),
    clearUserCache: vi.fn(),
  },
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { RoleAssignmentsPanel } = await import('../RoleAssignmentsPanel');

describe('RoleAssignmentsPanel', () => {
  it('renders the assignments table with User, Role, and Status columns', async () => {
    render(<RoleAssignmentsPanel />);
    const table = await screen.findByRole('table');
    const headerTexts = within(table)
      .getAllByRole('columnheader')
      .map(h => h.textContent ?? '');
    expect(headerTexts.some(t => t.startsWith('User'))).toBe(true);
    expect(headerTexts.some(t => t.startsWith('Role'))).toBe(true);
    expect(headerTexts.some(t => t.startsWith('Status'))).toBe(true);
  });

  it('renders user emails in rows', async () => {
    render(<RoleAssignmentsPanel />);
    await screen.findByRole('table');
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
  });

  it('explains unresolved users and roles instead of showing bare "Unknown" labels', async () => {
    render(<RoleAssignmentsPanel />);
    await screen.findByRole('table');
    expect(screen.queryByText('Unknown User')).not.toBeInTheDocument();
    expect(screen.queryByText('Unknown Role')).not.toBeInTheDocument();
    expect(screen.getByText('Unresolved user')).toBeInTheDocument();
    expect(
      screen.getByText(/No people label resolved for user_id missing-user/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Unresolved role')).toBeInTheDocument();
    expect(screen.getByText(/No roles row resolved for role_id missing-role/i)).toBeInTheDocument();
  });

  it('renders Active and Inactive status badges', async () => {
    render(<RoleAssignmentsPanel />);
    await screen.findByRole('table');
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('renders a revoke action for each row', async () => {
    render(<RoleAssignmentsPanel />);
    await screen.findByRole('table');
    const menuTriggers = screen
      .getAllByRole('button')
      .filter(btn => btn.querySelector('.sr-only')?.textContent === 'Open menu');
    expect(menuTriggers.length).toBeGreaterThan(0);
  });

  it('falls back to the role name in summary cards when display_name is absent', async () => {
    render(<RoleAssignmentsPanel />);
    await screen.findByRole('table');
    expect(screen.getByText('judge', { selector: '.text-lg' })).toBeInTheDocument();
  });

  it('shows the role summary without requiring a tab click', async () => {
    render(<RoleAssignmentsPanel />);
    await screen.findByRole('table');
    expect(screen.queryByRole('tab', { name: /role summary/i })).not.toBeInTheDocument();
    expect(screen.getByText('Secretary', { selector: '.text-lg' })).toBeInTheDocument();
  });

  it('offers no way to assign a role, and points at User Management instead', async () => {
    render(<RoleAssignmentsPanel />);
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /assign role/i })).not.toBeInTheDocument();
    const link = screen.getByRole('link', { name: /user management/i });
    expect(link).toHaveAttribute('href', '/admin/users');
  });

  it('names the toolbar link by what it does, not just where it goes', async () => {
    render(<RoleAssignmentsPanel />);
    await screen.findByRole('table');
    expect(
      screen.getByRole('link', { name: 'Assign roles in User Management' })
    ).toBeInTheDocument();
  });

  it('derives the Scope column from show_id/club_id, not the unpopulated scope_type/scope_id fields', async () => {
    render(<RoleAssignmentsPanel />);
    await screen.findByRole('table');
    // ur-2: club-scoped (club_id: 'club-1')
    expect(screen.getByText('Club: club-1')).toBeInTheDocument();
    // ur-4: show-scoped (show_id: 'show-9')
    expect(screen.getByText('Show: show-9')).toBeInTheDocument();
    // ur-1 and ur-3: unscoped
    expect(screen.getAllByText('Global').length).toBeGreaterThanOrEqual(2);
  });
});
