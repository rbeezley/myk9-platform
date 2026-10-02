/**
 * MYK9-930 review: an unresolved identity or a failed roster read is NOT "Person
 * Not Found". The REAL useRoleBasedPeople and useCanAccessPerson run here; only
 * their inputs (auth context, the users query, the people store) are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { User } from '@/types/user-types';

const auth = vi.hoisted(() => ({
  value: {
    userWithRoles: null as null | { id: string; databaseUserId?: string },
    roles: [] as string[],
  },
}));
const usersQuery = vi.hoisted(() => ({
  value: {
    data: [] as unknown[],
    isLoading: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
}));
const people = vi.hoisted(() => ({ value: [] as unknown[] }));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: auth.value.userWithRoles,
    hasRole: (role: string) => auth.value.roles.includes(role),
  }),
}));
vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission: () => false }) }));
vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({ dogs: [], isLoading: false, error: null }),
}));
vi.mock('@/store/userStore', () => ({
  useUserStore: (selector: (s: { people: unknown[] }) => unknown) =>
    selector({ people: people.value }),
}));
vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useUsersQuery: () => usersQuery.value,
  useDeletedUserQuery: () => ({ data: null, isLoading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('@/components/users/UserDetails/UserDetailsView', () => ({
  default: ({ person }: { person: User }) => <div data-testid="details">{person.firstName}</div>,
}));

import PersonDetailPage from '../PersonDetailPage';

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/people/${id}`]}>
      <Routes>
        <Route path="/people/:id" element={<PersonDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const grace = { id: 'p-1', firstName: 'Grace', lastName: 'Hopper', user_id: 'auth-1' };

beforeEach(() => {
  vi.clearAllMocks();
  auth.value = { userWithRoles: { id: 'auth-1', databaseUserId: 'p-1' }, roles: ['secretary'] };
  usersQuery.value = { data: [grace], isLoading: false, error: null, refetch: vi.fn() };
  people.value = [grace];
});

describe('PersonDetailPage with unresolved inputs (MYK9-930)', () => {
  it('positive control: a secretary with a loaded roster opens the person', () => {
    renderAt('p-1');
    expect(screen.getByTestId('details')).toHaveTextContent('Grace');
  });

  it('positive control: a loaded roster that lacks the id IS Person Not Found', () => {
    renderAt('nobody');
    expect(screen.getByRole('heading', { name: 'Person Not Found' })).toBeInTheDocument();
  });

  it('does not say Not Found while the viewer identity is unresolved', () => {
    auth.value = { userWithRoles: null, roles: [] };
    usersQuery.value = { data: [], isLoading: false, error: null, refetch: vi.fn() };

    renderAt('p-1');

    expect(screen.queryByRole('heading', { name: /not found/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('details')).not.toBeInTheDocument();
  });

  it('shows a retryable error, not Not Found, when the roster read failed', () => {
    const refetch = vi.fn();
    usersQuery.value = { data: [], isLoading: false, error: new Error('offline'), refetch };

    renderAt('p-1');

    expect(screen.queryByRole('heading', { name: /not found/i })).not.toBeInTheDocument();
    expect(screen.getByText(/couldn't load this person/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again|retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('Codex round 4: an exhibitor with unresolved identity, no people and a failed roster read sees the error and its retry', () => {
    const refetch = vi.fn();
    auth.value = { userWithRoles: { id: 'auth-9' }, roles: ['exhibitor'] };
    usersQuery.value = { data: [], isLoading: false, error: new Error('offline'), refetch };
    people.value = [];

    renderAt('p-9');

    expect(screen.getByText(/couldn't load this person/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again|retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('an exhibitor whose own person row has not loaded yet is still looking, not refused', () => {
    auth.value = { userWithRoles: { id: 'auth-9' }, roles: ['exhibitor'] };
    usersQuery.value = { data: [], isLoading: false, error: null, refetch: vi.fn() };
    people.value = [];

    renderAt('p-9');

    expect(
      screen.queryByRole('heading', { name: /not found|can't open/i })
    ).not.toBeInTheDocument();
  });

  it("an exhibitor opening someone else's record is told they can't open it, not Not Found", () => {
    auth.value = { userWithRoles: { id: 'auth-9', databaseUserId: 'p-9' }, roles: ['exhibitor'] };

    renderAt('p-1');

    expect(screen.getByRole('heading', { name: "You can't open this person" })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Person Not Found' })).not.toBeInTheDocument();
  });
});
