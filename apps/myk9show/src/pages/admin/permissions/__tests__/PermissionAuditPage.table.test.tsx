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
        action: 'revoke_role',
        user_id: 'user-def-456',
        target_type: 'permission',
        target_id: 'perm-abc',
        old_value: null,
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

  it('renders stat cards above the table', async () => {
    render(<PermissionAuditPage />);
    await screen.findByRole('table');
    expect(screen.getByText('Total Events')).toBeInTheDocument();
    expect(screen.getByText('Role Changes')).toBeInTheDocument();
    expect(screen.getByText('Permission Changes')).toBeInTheDocument();
    expect(screen.getByText('Unique Users')).toBeInTheDocument();
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

  it('renders export button', async () => {
    render(<PermissionAuditPage />);
    await screen.findByRole('table');
    expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
  });
});
