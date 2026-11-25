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
let viewerPermissions: string[] = [];

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: false, error: null }) },
}));

vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission: () => false }) }));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'current-user-id' },
    getUserRoles: () => viewerRoles,
    hasPermission: (permission: string) => viewerPermissions.includes(permission),
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
  default: ({
    personId,
    canManageQualifications,
  }: {
    personId: string;
    canManageQualifications: boolean;
  }) => (
    <section aria-label="Judge Qualifications" data-can-manage={String(canManageQualifications)}>
      {personId}
    </section>
  ),
}));

import UserDetailsView from '@/components/users/UserDetails/UserDetailsView';

const person = (roles: UserRole[], extra: Partial<User> = {}): User =>
  ({
    ...extra,
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
    viewerPermissions = [];
  });

  it('shows a secretary the card on an exhibitor, so she can add a qualification', () => {
    viewerRoles = [UserRole.SECRETARY];
    viewerPermissions = ['show:manage'];
    render(<UserDetailsView person={person([UserRole.EXHIBITOR])} />);
    expect(card()).toHaveTextContent('p1');
    expect(card()).toHaveAttribute('data-can-manage', 'true');
  });

  it('shows a removed judge read-only, so an admin can still read the credentials', () => {
    viewerRoles = [UserRole.SITE_ADMIN];
    viewerPermissions = ['admin:manage'];
    const removed = { deletedAt: '2026-11-01T00:00:00Z' } as Partial<User>;
    render(<UserDetailsView person={person([UserRole.JUDGE], removed)} />);
    expect(card()).toHaveAttribute('data-can-manage', 'false');
  });

  it('does not offer a removed exhibitor the card at all', () => {
    viewerRoles = [UserRole.SECRETARY];
    const removed = { deletedAt: '2026-11-01T00:00:00Z' } as Partial<User>;
    render(<UserDetailsView person={person([UserRole.EXHIBITOR], removed)} />);
    expect(card()).not.toBeInTheDocument();
  });

  it('lets a secretary manage even without show:manage, as the server allows', () => {
    viewerRoles = [UserRole.SECRETARY];
    render(<UserDetailsView person={person([UserRole.EXHIBITOR])} />);
    expect(card()).toHaveAttribute('data-can-manage', 'true');
  });

  it('shows a site admin the card on a person with no roles', () => {
    viewerRoles = [UserRole.SITE_ADMIN];
    viewerPermissions = ['admin:manage'];
    render(<UserDetailsView person={person([])} />);
    expect(card()).toHaveAttribute('data-can-manage', 'true');
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
