/**
 * MYK9-153: a removed person's record stays reachable for an admin.
 *
 * `people_select` is `deleted_at IS NULL`, so a removed person is absent from
 * role-based data and this page used to bounce to /people — the app had no
 * surface that could show them at all.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { User } from '@/types/user-types';

const live = { id: 'live-1', firstName: 'Grace', lastName: 'Hopper' } as User;
const removed = {
  id: 'gone-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  deletedAt: '2026-07-30T00:00:00Z',
} as User;

const roleBasedPeople = { people: [live], isLoading: false };
const rbac = { hasPermission: vi.fn(() => true) };
const deletedQuery = vi.fn(() => ({ data: null as User | null, isLoading: false }));
const deletedQuerySpy = vi.fn();

vi.mock('@/hooks/useRoleBasedData', () => ({
  useRoleBasedPeople: () => roleBasedPeople,
  useCanAccessPerson: () => true,
}));

vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: () => rbac,
}));

vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useDeletedUserQuery: (id: string, enabled: boolean) => {
    deletedQuerySpy(id, enabled);
    return enabled ? deletedQuery() : { data: null, isLoading: false };
  },
}));

vi.mock('@/components/users/UserDetails/UserDetailsView', () => ({
  default: ({ person }: { person: User }) => (
    <div data-testid="details">
      {person.firstName} {person.lastName}
    </div>
  ),
}));

import PersonDetailPage from '../PersonDetailPage';

function LocationProbe() {
  return <div data-testid="browse">{useLocation().pathname}</div>;
}

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/people/${id}`]}>
      <Routes>
        <Route path="/people/:id" element={<PersonDetailPage />} />
        <Route path="/people" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PersonDetailPage — removed people', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rbac.hasPermission = vi.fn(() => true);
    deletedQuery.mockReturnValue({ data: null, isLoading: false });
  });

  it('renders a live person without asking the removed-person read', () => {
    renderAt('live-1');

    expect(screen.getByTestId('details')).toHaveTextContent('Grace Hopper');
    // The fallback must stay disabled on the ordinary path — it costs a request
    // and an admin-gated RPC call for every profile view otherwise.
    expect(deletedQuerySpy).toHaveBeenCalledWith('live-1', false);
  });

  it('renders a removed person for an admin instead of bouncing', () => {
    deletedQuery.mockReturnValue({ data: removed, isLoading: false });

    renderAt('gone-1');

    expect(screen.getByTestId('details')).toHaveTextContent('Ada Lovelace');
    expect(screen.queryByTestId('browse')).not.toBeInTheDocument();
  });

  it('does not ask for removed people without admin:manage', () => {
    rbac.hasPermission = vi.fn(() => false);
    deletedQuery.mockReturnValue({ data: removed, isLoading: false });

    renderAt('gone-1');

    expect(deletedQuerySpy).toHaveBeenCalledWith('gone-1', false);
    expect(screen.getByTestId('browse')).toHaveTextContent('/people');
  });

  it('still bounces when the id is nobody at all', () => {
    deletedQuery.mockReturnValue({ data: null, isLoading: false });

    renderAt('nobody');

    expect(screen.getByTestId('browse')).toHaveTextContent('/people');
  });

  it('waits for the removed-person read rather than bouncing mid-flight', () => {
    deletedQuery.mockReturnValue({ data: null, isLoading: true });

    renderAt('gone-1');

    // Redirecting while the fallback is still resolving is the bug that makes
    // this page look like it "hangs or bounces" at random.
    expect(screen.queryByTestId('browse')).not.toBeInTheDocument();
  });
});
