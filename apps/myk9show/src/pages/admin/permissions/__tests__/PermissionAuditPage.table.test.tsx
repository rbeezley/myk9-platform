import { render, screen, within } from '@/test/utils/testUtils';
import { vi } from 'vitest';

vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: {
    getAuditLogs: vi.fn().mockResolvedValue([
      {
        id: 'log-1',
        action: 'assign_role',
        user_id: 'user-abc-123',
        target_type: 'role',
        target_id: 'role-xyz',
        old_value: null,
        new_value: { role: 'secretary' },
        ip_address: null,
        user_agent: null,
        created_at: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 'log-2',
        action: 'role_revoked',
        user_id: 'user-def-456',
        target_type: 'user',
        target_id: 'user-club',
        old_value: {
          club_id: 'club-heartland',
          role_id: 'role-secretary',
          show_id: null,
          role_name: 'secretary',
        },
        new_value: null,
        ip_address: null,
        user_agent: null,
        created_at: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: 'log-3',
        action: 'grant_permission',
        user_id: null,
        target_type: 'user',
        target_id: 'user-ghi',
        old_value: null,
        new_value: { permission: 'show:manage', scope: 'global' },
        ip_address: null,
        user_agent: null,
        created_at: new Date(Date.now() - 172800000).toISOString(),
      },
    ]),
    clearAllCache: vi.fn(),
    clearUserCache: vi.fn(),
  },
}));

// Must import AFTER mock setup
const { default: PermissionAuditPage } = await import('../PermissionAuditPage');

describe('PermissionAuditPage DataTable migration', () => {
  it('renders sortable column headers', async () => {
    render(<PermissionAuditPage />);
    const table = await screen.findByRole('table');
    const headers = within(table).getAllByRole('columnheader');
    const headerTexts = headers.map(h => h.textContent ?? '');
    expect(headerTexts.some(t => t.startsWith('Action'))).toBe(true);
    expect(headerTexts.some(t => t.startsWith('Actor'))).toBe(true);
    expect(headerTexts.some(t => t.startsWith('Time'))).toBe(true);
  });

  it('renders search input', async () => {
    render(<PermissionAuditPage />);
    await screen.findByRole('table');
    expect(screen.getByPlaceholderText(/search audit/i)).toBeInTheDocument();
  });

  it('renders date range selector', async () => {
    render(<PermissionAuditPage />);
    await screen.findByRole('table');
    expect(screen.getByRole('combobox', { name: /date range/i })).toBeInTheDocument();
  });

  it('renders action filter control', async () => {
    render(<PermissionAuditPage />);
    await screen.findByRole('table');
    expect(screen.getByRole('combobox', { name: /action filter/i })).toBeInTheDocument();
  });

  it('renders a compact audit summary above the table', async () => {
    render(<PermissionAuditPage />);
    await screen.findByRole('table');
    expect(screen.getByText('3 changes')).toBeInTheDocument();
    expect(screen.getByText('2 role changes')).toBeInTheDocument();
    expect(screen.getByText('1 permission change')).toBeInTheDocument();
    expect(screen.queryByText('Total Events')).not.toBeInTheDocument();
  });

  it('renders column visibility toggle', async () => {
    render(<PermissionAuditPage />);
    await screen.findByRole('table');
    expect(screen.getByRole('button', { name: /toggle columns/i })).toBeInTheDocument();
  });

  it('renders all audit log rows as flat list', async () => {
    render(<PermissionAuditPage />);
    await screen.findByRole('table');
    const rows = screen.getAllByRole('row');
    // 1 header row + 3 data rows
    expect(rows.length).toBe(4);
  });

  it('renders revoked role details from the previous value', async () => {
    render(<PermissionAuditPage />);
    const table = await screen.findByRole('table');
    const revokeAction = within(table).getByText('Role Revoked');
    const revokeRow = revokeAction.closest('tr');

    expect(revokeRow).not.toBeNull();
    if (!revokeRow) throw new Error('Expected the revoked role audit row');
    expect(within(revokeRow).getByText('role_name:')).toBeInTheDocument();
    expect(within(revokeRow).getByText('secretary')).toBeInTheDocument();
    expect(within(revokeRow).getByText('club-heartland')).toBeInTheDocument();
  });

  it('renders export button', async () => {
    render(<PermissionAuditPage />);
    await screen.findByRole('table');
    expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
  });
});
