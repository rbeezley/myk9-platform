import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import ClubMembersPage from './ClubMembersPage';

const loadClubs = vi.fn();
const loadUsers = vi.fn();

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: {
      scopes: [{ scopeType: 'club', roleId: 'club_admin', scopeId: 'club-1' }],
    },
  }),
}));

vi.mock('@/store/clubStore', () => ({
  useClubStore: () => ({
    clubs: [{ id: 'club-1', name: 'Heartland Club' }],
    loadClubs,
  }),
}));

vi.mock('@/store/userStore', () => ({
  useUserStore: () => ({
    people: [],
    loadUsers,
  }),
}));

vi.mock('@/services/database/club-memberships', () => ({
  getClubMembers: vi.fn(() => new Promise(() => {})),
  getClubOfficers: vi.fn(() => new Promise(() => {})),
  addClubMember: vi.fn(),
  updateClubMember: vi.fn(),
  removeClubMember: vi.fn(),
  addClubOfficer: vi.fn(),
  removeClubOfficer: vi.fn(),
  getClubShowManagerIds: vi.fn(() => new Promise(() => {})),
}));

vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: {
    ensureUserHasRole: vi.fn(),
    revokeRole: vi.fn(),
  },
}));

describe('ClubMembersPage loading state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses a skeleton, not a spinner, while club members load', async () => {
    render(<ClubMembersPage />);

    expect(await screen.findByRole('status', { name: 'Loading club members' })).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeNull();
    expect(screen.queryByLabelText('Loading members')).not.toBeInTheDocument();
  });
});
