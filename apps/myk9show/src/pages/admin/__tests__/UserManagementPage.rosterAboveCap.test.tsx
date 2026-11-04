/**
 * MYK9-1561: PostgREST caps a response at max_rows (1000), so the admin roster
 * is read in .range() pages. A person past the first page must still resolve
 * from a ?userId= deep link, and the Signups (?from=) drill-down must list
 * everyone the dashboard count counts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import {
  ADMIN_USER_LIST_MAX_PAGES,
  ADMIN_USER_LIST_PAGE_SIZE,
  fetchAdminUserListRows,
} from '@/hooks/queries/adminUserListPaging';

const { mockRpc, mockRange } = vi.hoisted(() => ({ mockRpc: vi.fn(), mockRange: vi.fn() }));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: mockRpc },
}));

vi.mock('@/components/admin/users/UserTable', () => ({
  UserTable: ({ totalFilteredUsers }: { totalFilteredUsers: number }) => (
    <div data-testid="user-table" data-total={totalFilteredUsers} />
  ),
}));
vi.mock('@/components/admin/users/CreateUserDialog', () => ({ CreateUserDialog: () => null }));
vi.mock('@/components/admin/users/BulkActionsBar', () => ({ BulkActionsBar: () => null }));
vi.mock('@/components/panels/edit/UserEditPanel', () => ({ UserEditPanel: () => null }));
vi.mock('@/components/admin/permissions/ManageUserRolesDialog', () => ({
  ManageUserRolesDialog: ({ user }: { user: { id: string } }) => (
    <div data-testid="manage-roles-dialog">{user.id}</div>
  ),
}));

import UserManagementPage from '../UserManagementPage';

const TOTAL = 2237;
const SIGNUP_CUTOFF = '2026-11-04T05:00:00.000Z';

/** Row i; the last 40 rows (all past the first page) signed up after the cutoff. */
function row(i: number) {
  return {
    id: `person-${i}`,
    first_name: 'P',
    last_name: String(i).padStart(5, '0'),
    email: `p${i}@example.com`,
    phone: null,
    status: 'active',
    roles: ['exhibitor'],
    profile_image: null,
    deleted_at: null,
    deleted_by: null,
    created_at: i >= TOTAL - 40 ? '2026-11-04T12:00:00Z' : '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    last_sign_in_at: null,
  };
}
const ROSTER = Array.from({ length: TOTAL }, (_, i) => row(i));

beforeEach(() => {
  vi.clearAllMocks();
  // Like PostgREST: honours .range(from, to) inclusive.
  mockRange.mockImplementation((from: number, to: number) =>
    Promise.resolve({ data: ROSTER.slice(from, to + 1), error: null })
  );
  mockRpc.mockReturnValue({ range: mockRange });
});

describe('fetchAdminUserListRows', () => {
  it('pages 1000 + 1000 + 237 and returns all 2237 rows in order', async () => {
    const rows = await fetchAdminUserListRows(false);

    expect(rows).toHaveLength(TOTAL);
    expect(new Set(rows.map(r => r.id)).size).toBe(TOTAL);
    expect(rows[0]!.id).toBe('person-0');
    expect(rows[TOTAL - 1]!.id).toBe(`person-${TOTAL - 1}`);
    expect(mockRpc).toHaveBeenCalledWith('get_admin_user_list', { show_deleted: false });
    expect(mockRange.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('asks for one more page when the roster is an exact multiple of the page size', async () => {
    const exact = ROSTER.slice(0, ADMIN_USER_LIST_PAGE_SIZE * 2);
    mockRange.mockImplementation((from: number, to: number) =>
      Promise.resolve({ data: exact.slice(from, to + 1), error: null })
    );
    const rows = await fetchAdminUserListRows(true);
    expect(rows).toHaveLength(exact.length);
    expect(mockRange).toHaveBeenCalledTimes(3);
    expect(mockRpc).toHaveBeenCalledWith('get_admin_user_list', { show_deleted: true });
  });

  it('throws on an RPC error instead of returning a partial roster', async () => {
    mockRange
      .mockResolvedValueOnce({ data: ROSTER.slice(0, 1000), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(fetchAdminUserListRows(false)).rejects.toThrow('boom');
  });

  it('refuses to loop forever when every page comes back full', async () => {
    mockRange.mockResolvedValue({ data: ROSTER.slice(0, 1000), error: null });
    await expect(fetchAdminUserListRows(false)).rejects.toThrow(/partial roster/);
    expect(mockRange).toHaveBeenCalledTimes(ADMIN_USER_LIST_MAX_PAGES);
  });
});

describe('UserManagementPage with a roster above the row limit', () => {
  it('resolves a ?userId= deep link to a person past the first page', async () => {
    render(<UserManagementPage />, { initialRoute: '/admin/users?userId=person-2100' });

    expect(await screen.findByTestId('manage-roles-dialog')).toHaveTextContent('person-2100');
    expect(screen.queryByText(/user not found/i)).not.toBeInTheDocument();
  });

  it('lists the full roster, not just the first page', async () => {
    render(<UserManagementPage />, { initialRoute: '/admin/users' });

    await waitFor(() =>
      expect(screen.getByTestId('user-table')).toHaveAttribute('data-total', String(TOTAL))
    );
  });

  it('the Signups drill-down lists every signup, all of them past the first page', async () => {
    render(<UserManagementPage />, {
      initialRoute: `/admin/users?from=${encodeURIComponent(SIGNUP_CUTOFF)}`,
    });

    await waitFor(() =>
      expect(screen.getByTestId('user-table')).toHaveAttribute('data-total', '40')
    );
  });
});
