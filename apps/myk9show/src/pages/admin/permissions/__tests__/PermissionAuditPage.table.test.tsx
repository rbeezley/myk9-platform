import { render, screen, within } from '@/test/utils/testUtils';
import { UrlProbe, readUrlParams } from '@/test/utils/UrlProbe';
import { vi } from 'vitest';

vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: {
    getAuditLogs: vi.fn().mockResolvedValue([
      {
        id: 'log-1',
        action: 'role_assigned',
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
        action: 'permission_granted',
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
    expect(screen.getByRole('combobox', { name: /^action$/i })).toBeInTheDocument();
  });

  it('renders a compact audit summary above the table', async () => {
    render(<PermissionAuditPage />);
    await screen.findByRole('table');
    expect(screen.getByText('3 changes')).toBeInTheDocument();
    expect(screen.getByText('2 role changes')).toBeInTheDocument();
    expect(screen.getByText('1 permission change')).toBeInTheDocument();
    expect(screen.queryByText('Total Events')).not.toBeInTheDocument();
  });

  it('has no Columns control (owner decision 4)', async () => {
    render(<PermissionAuditPage />);
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /toggle columns/i })).not.toBeInTheDocument();
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

  it('narrows rows with the Action filter and reports the count', async () => {
    const { user } = render(<PermissionAuditPage />);
    await screen.findByRole('table');
    expect(screen.getByText('Showing all 3 events.')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: /^action$/i }));
    await user.click(await screen.findByRole('option', { name: 'Role Revoked' }));

    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('Showing 1 of 3 events.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show all events' }));
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });

  it('searches the audit log and reports the count', async () => {
    const { user } = render(<PermissionAuditPage />);
    await screen.findByRole('table');

    await user.type(screen.getByPlaceholderText(/search audit/i), 'heartland');

    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('Showing 1 of 3 events.')).toBeInTheDocument();
  });

  it('renders export button', async () => {
    render(<PermissionAuditPage />);
    await screen.findByRole('table');
    expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
  });

  it('applies search, action and range from the URL and keeps other params', async () => {
    render(
      <>
        <PermissionAuditPage />
        <UrlProbe />
      </>,
      {
        initialRoute:
          '/admin/permissions?tab=audit&audit_action=role_revoked&audit_q=heartland&audit_range=30d',
      }
    );
    await screen.findByRole('table');

    expect(screen.getByText('Showing 1 of 3 events.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /date range/i })).toHaveTextContent('Last 30 days');
    expect(readUrlParams(screen.getByTestId('url-search').textContent).get('tab')).toBe('audit');
  });

  it('writes the action filter to the URL and preserves other params', async () => {
    const { user } = render(
      <>
        <PermissionAuditPage />
        <UrlProbe />
      </>,
      { initialRoute: '/admin/permissions?tab=audit' }
    );
    await screen.findByRole('table');

    await user.click(screen.getByRole('combobox', { name: /^action$/i }));
    await user.click(await screen.findByRole('option', { name: 'Role Revoked' }));

    const params = readUrlParams(screen.getByTestId('url-search').textContent);
    expect(params.get('audit_action')).toBe('role_revoked');
    expect(params.get('tab')).toBe('audit');
  });

  it('treats a changed date range as filtered, and Show all events restores the default', async () => {
    const { user } = render(
      <>
        <PermissionAuditPage />
        <UrlProbe />
      </>,
      { initialRoute: '/admin/permissions?tab=audit' }
    );
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: 'Show all events' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: /date range/i }));
    await user.click(await screen.findByRole('option', { name: 'Last 30 days' }));
    await screen.findByRole('table');

    expect(readUrlParams(screen.getByTestId('url-search').textContent).get('audit_range')).toBe(
      '30d'
    );
    await user.click(screen.getByRole('button', { name: 'Show all events' }));
    await screen.findByRole('table');

    const params = readUrlParams(screen.getByTestId('url-search').textContent);
    expect(params.has('audit_range')).toBe(false);
    expect(params.get('tab')).toBe('audit');
    expect(screen.getByRole('combobox', { name: /date range/i })).toHaveTextContent('Last 7 days');
  });
});
