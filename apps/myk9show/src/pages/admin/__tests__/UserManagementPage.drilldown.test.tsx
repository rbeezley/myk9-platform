/**
 * Phase B: the roster drills down to the person's record, and the URL holds
 * enough view state that the trip is reversible.
 * See docs/plan-ia-admin-person-detail.md.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User } from '@/types/user-types';

const { mockUpdateUser } = vi.hoisted(() => ({ mockUpdateUser: vi.fn() }));

const person = {
  id: 'user-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  roles: ['exhibitor'],
  status: 'active',
} as unknown as User;

vi.mock('@/hooks/queries/useUsersQuery', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/queries/useUsersQuery')>()),
  useAdminUsersQuery: () => ({
    data: [person],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useUpdateUserMutation: () => ({ mutateAsync: mockUpdateUser }),
}));

// Stand in for the table so the test drives the two intents directly rather
// than through row-click plumbing (covered in UserTable's own suite).
vi.mock('@/components/admin/users/UserTable', () => ({
  UserTable: ({
    onViewUser,
    onEditUser,
  }: {
    onViewUser: (user: User) => void;
    onEditUser: (user: User) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onViewUser(person)}>
        row click
      </button>
      <button type="button" onClick={() => onEditUser(person)}>
        menu edit
      </button>
    </div>
  ),
}));

vi.mock('@/components/panels/edit/UserEditPanel', () => ({
  UserEditPanel: ({
    open,
    userName,
    initialUserData,
    onSave,
  }: {
    open: boolean;
    userName: string;
    initialUserData: User;
    onSave: (updates: Partial<User>) => Promise<void>;
  }) =>
    open ? (
      <div data-testid="edit-panel">
        <span>{userName}</span>
        <span data-testid="edit-panel-user">{JSON.stringify(initialUserData)}</span>
        <button type="button" onClick={() => onSave({ phone: '555-0200' })}>
          save user
        </button>
      </div>
    ) : null,
}));

import UserManagementPage from '../UserManagementPage';

function PersonProbe() {
  const location = useLocation();
  return (
    <div>
      <span data-testid="person-path">{location.pathname}</span>
      <span data-testid="person-state">{JSON.stringify(location.state)}</span>
    </div>
  );
}

function renderAt(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/admin/users" element={<UserManagementPage />} />
          <Route path="/people/:id" element={<PersonProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { user, client };
}

const backTo = () => JSON.parse(screen.getByTestId('person-state').textContent || 'null')?.backTo;

describe('UserManagementPage drill-down', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateUser.mockResolvedValue({ ...person, phone: '555-0200' });
  });

  it('opens the person record on a row click', async () => {
    const { user } = renderAt('/admin/users');

    await user.click(screen.getByRole('button', { name: 'row click' }));

    expect(screen.getByTestId('person-path')).toHaveTextContent('/people/user-1');
  });

  it('carries the current list back to the person breadcrumb', async () => {
    // Filters that still match the row — an empty list has no row to click.
    const { user } = renderAt('/admin/users?q=ada&role=exhibitor&page=2');

    await user.click(screen.getByRole('button', { name: 'row click' }));

    expect(backTo()).toEqual({
      href: '/admin/users?q=ada&role=exhibitor&page=2',
      label: 'Users',
      parent: { label: 'Admin', href: '/admin' },
    });
  });

  it('links back to a bare roster when nothing is filtered', async () => {
    const { user } = renderAt('/admin/users');

    await user.click(screen.getByRole('button', { name: 'row click' }));

    expect(backTo().href).toBe('/admin/users');
  });

  it('keeps editing in place — no navigation', async () => {
    const { user } = renderAt('/admin/users');

    await user.click(screen.getByRole('button', { name: 'menu edit' }));

    expect(screen.queryByTestId('person-path')).not.toBeInTheDocument();
    expect(await screen.findByTestId('edit-panel')).toHaveTextContent('Ada Lovelace');
  });

  it('reopens after save with the complete detail user, not the role-less mutation row', async () => {
    const { user, client } = renderAt('/admin/users');
    const completeUser = {
      ...person,
      dateOfBirth: '2011-03-04',
      juniorHandlerNumbers: { AKC: '7654321' },
      privateFieldsReadComplete: true,
      roles: ['judge'],
      judgeQualifications: [],
    } as unknown as User;
    client.setQueryData(['users', 'detail', person.id], completeUser);

    await user.click(screen.getByRole('button', { name: 'menu edit' }));
    expect(screen.getByTestId('edit-panel-user')).toHaveTextContent('2011-03-04');
    expect(screen.getByTestId('edit-panel-user')).toHaveTextContent('judge');

    await user.click(screen.getByRole('button', { name: 'save user' }));
    expect(screen.queryByTestId('edit-panel')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'menu edit' }));
    expect(screen.getByTestId('edit-panel-user')).toHaveTextContent('2011-03-04');
    expect(screen.getByTestId('edit-panel-user')).toHaveTextContent('judge');
  });

  it('reads the search term out of the URL', () => {
    renderAt('/admin/users?q=ada');

    expect(screen.getByPlaceholderText(/search by name/i)).toHaveValue('ada');
  });

  it('writes a typed search back to the URL', async () => {
    const { user } = renderAt('/admin/users');

    await user.type(screen.getByPlaceholderText(/search by name/i), 'ada');
    await user.click(screen.getByRole('button', { name: 'row click' }));

    // Round trip through the URL is what makes the Back button work.
    expect(backTo().href).toBe('/admin/users?q=ada');
  });
});
