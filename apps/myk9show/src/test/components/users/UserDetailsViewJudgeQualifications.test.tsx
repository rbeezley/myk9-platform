/**
 * MYK9-2382: a secretary or site admin can add a judge qualification to anyone on their
 * People record. The record used to show the Judge Qualifications card only when the
 * person's role list held `judge`, which a secretary often cannot see (unscoped grants are
 * hidden from her) and which a judge added from Edit show never has.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { User } from '@/types/dog-types';
import { UserRole } from '@/types/auth-types';

let viewerRoles: UserRole[] = [];

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: false, error: null }) },
}));

vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission: () => false }) }));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'current-user-id' },
    getUserRoles: () => viewerRoles,
    hasPermission: () => false,
  }),
}));

vi.mock('@/hooks/useRoleBasedData', () => ({ useRoleBasedPeople: () => ({ people: [] }) }));

vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useUpdateUserMutation: () => ({ mutateAsync: vi.fn() }),
  useDeleteUserMutation: () => ({ mutateAsync: vi.fn() }),
  usePermanentDeleteUserMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/services/database/users', () => ({ restoreUser: vi.fn() }));

vi.mock('@/store/userStore', () => ({ useUserStore: () => ({ loadUsers: vi.fn() }) }));

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useOwnerDogsWithQuery: () => ({ dogs: [], isLoading: false, error: null, refetch: vi.fn() }),
  useDogStoreCompat: () => ({ dogs: [], getDogsByOwner: () => [], isLoading: false, error: null }),
}));

vi.mock('@/components/users/UserDetails/UserDetailsTabs', () => ({ default: () => <div /> }));
vi.mock('@/components/users/UserDetails/JudgeAvailabilityCard', () => ({ default: () => <div /> }));
vi.mock('@/components/users/UserDetails/UserDetailsDialogs', () => ({ default: () => <div /> }));
vi.mock('@/components/users/UserDetails/JudgeQualificationsCard', () => ({
  default: ({ personId }: { personId: string }) => (
    <section aria-label="Judge Qualifications">{personId}</section>
  ),
}));

import UserDetailsView from '@/components/users/UserDetails/UserDetailsView';

const person = (roles: UserRole[]): User =>
  ({
    id: 'p1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.test',
    roles,
    dogs: [],
  }) as User;

const card = () => screen.queryByRole('region', { name: 'Judge Qualifications' });

describe('UserDetailsView: who sees the Judge Qualifications card', () => {
  beforeEach(() => {
    viewerRoles = [];
  });

  it('shows a secretary the card on an exhibitor, so she can add a qualification', () => {
    viewerRoles = [UserRole.SECRETARY];
    render(<UserDetailsView person={person([UserRole.EXHIBITOR])} />);
    expect(card()).toHaveTextContent('p1');
  });

  it('shows a site admin the card on a person with no roles', () => {
    viewerRoles = [UserRole.SITE_ADMIN];
    render(<UserDetailsView person={person([])} />);
    expect(card()).toBeInTheDocument();
  });

  it('does not show a club admin the card on an exhibitor (the server would refuse the write)', () => {
    viewerRoles = [UserRole.CLUB_ADMIN];
    render(<UserDetailsView person={person([UserRole.EXHIBITOR])} />);
    expect(card()).not.toBeInTheDocument();
  });

  it('still shows anyone the card on a person whose role list says judge', () => {
    viewerRoles = [UserRole.EXHIBITOR];
    render(<UserDetailsView person={person([UserRole.JUDGE])} />);
    expect(card()).toBeInTheDocument();
  });
});
