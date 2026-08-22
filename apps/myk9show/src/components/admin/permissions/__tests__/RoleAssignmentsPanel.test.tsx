import { render, screen, waitFor, within } from '@/test/utils/testUtils';
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
        club: { id: 'club-1', name: 'Blue Ridge Kennel Club' },
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
      {
        id: 'ur-5',
        user_id: 'user-444',
        role_id: 'role-2',
        club_id: 'club-missing',
        show_id: null,
        granted_by: 'admin-1',
        granted_at: '2026-05-01T10:00:00Z',
        expires_at: null,
        is_active: true,
        user_email: 'dave@example.com',
        role: {
          id: 'role-2',
          name: 'judge',
          display_name: null,
          description: 'Trial judge',
          is_system: true,
          permissions: null,
          created_at: null,
        },
        club: null,
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
    expect(screen.getByText(/could not be matched to a profile/i)).toBeInTheDocument();
    expect(screen.getByText('Unresolved role')).toBeInTheDocument();
    expect(screen.getByText(/could not be matched to a role definition/i)).toBeInTheDocument();
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
    const menuTriggers = screen.getAllByRole('button', { name: /actions for/i });
    expect(menuTriggers.length).toBeGreaterThan(0);
  });

  it('summarizes the ledger without rendering a second role-card representation', async () => {
    render(<RoleAssignmentsPanel />);
    await screen.findByRole('table');
    expect(screen.getByText('4 active assignments')).toBeInTheDocument();
    expect(screen.getByText('5 people')).toBeInTheDocument();
    expect(screen.getByText('2 role types')).toBeInTheDocument();
    expect(screen.queryByText('Total Assignments:')).not.toBeInTheDocument();
    expect(screen.getAllByText('Judge').length).toBeGreaterThan(0);
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

  it('names exact club scope in visible and accessible text while preserving show and global distinctions', async () => {
    render(<RoleAssignmentsPanel />);
    await screen.findByRole('table');
    // ur-2: club-scoped (club_id: 'club-1')
    expect(screen.getByRole('link', { name: 'Club: Blue Ridge Kennel Club' })).toHaveAttribute(
      'href',
      '/clubs/club-1'
    );
    // ur-4: show-scoped (show_id: 'show-9')
    expect(screen.getByRole('link', { name: 'Show' })).toHaveAttribute(
      'href',
      '/shows/show-9'
    );
    // ur-1 and ur-3: unscoped
    expect(screen.getAllByText('Global').length).toBeGreaterThanOrEqual(2);
  });

  it('makes exact club scope searchable through the Scope column', async () => {
    const { user } = render(<RoleAssignmentsPanel />);
    await screen.findByRole('table');

    await user.type(screen.getByPlaceholderText('Search by user, role, or scope...'), 'Blue Ridge');

    await waitFor(() => {
      expect(screen.getByText('bob@example.com')).toBeInTheDocument();
      expect(screen.queryByText('alice@example.com')).not.toBeInTheDocument();
    });
  });

  it('repeats user, role, and exact club scope in the revoke confirmation', async () => {
    const { user } = render(<RoleAssignmentsPanel />);
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'Actions for bob@example.com' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Revoke Role' }));

    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Are you sure you want to revoke the "Judge" role from bob@example.com for Club: Blue Ridge Kennel Club?'
    );
  });

  it('keeps an unresolved club scope explicit in the row and revoke confirmation', async () => {
    const { user } = render(<RoleAssignmentsPanel />);
    await screen.findByRole('table');

    expect(screen.getByText('Club: unresolved (club-missing)')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Club: unresolved (club-missing)' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Actions for dave@example.com' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Revoke Role' }));

    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Are you sure you want to revoke the "Judge" role from dave@example.com for Club: unresolved (club-missing)?'
    );
  });
});
