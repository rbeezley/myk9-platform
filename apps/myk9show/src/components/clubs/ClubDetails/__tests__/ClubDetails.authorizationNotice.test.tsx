/**
 * MYK9-1314: the Unauthorized badge and "Pending myK9 authorization" notice are for club staff
 * (MYK9-855). Goes through the real hook feeding the real ClubHeader, asserting on the DOM.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ScopeType, UserRole } from '@/types/auth-types';
import type { RoleScope, UserWithRoles } from '@/types/auth-types';
import type { Club } from '@/types/club-types';
import type { ValidatedClubContext } from '@/hooks/useValidatedClubContext';

const CLUB_A = '11111111-1111-4111-8111-111111111111';
const CLUB_B = '22222222-2222-4222-8222-222222222222';

const mockAuth = vi.hoisted(() => ({
  userWithRoles: null as UserWithRoles | null,
  user: null as { id: string } | null,
  rbacLoading: false,
  hasRole: () => false,
  hasPermission: () => false,
}));
const validated = vi.hoisted(() => ({ value: { status: 'loading' } as ValidatedClubContext }));

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => mockAuth }));
vi.mock('@/hooks/useValidatedClubContext', () => ({
  useCurrentValidatedClubContext: () => validated.value,
}));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('@/store/clubStore', () => ({
  useClubStore: () => ({ updateClub: vi.fn(), selectClub: vi.fn() }),
}));
vi.mock('@/store/showStore', () => ({
  useShowStore: (selector?: (s: { shows: unknown[] }) => unknown) =>
    selector ? selector({ shows: [] }) : { shows: [] },
}));
vi.mock('@/hooks/queries/useClubsDatabase', () => ({
  useDeleteClubMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/services/database/club-memberships/members', () => ({
  getClubMembers: vi.fn(async () => []),
  getActiveClubMembers: (members: unknown[]) => members,
}));
vi.mock('../useClubOfficials', () => ({ useClubOfficials: () => ({ officials: [] }) }));
vi.mock('@/hooks/queries/useClubRegistryNumbers', () => ({
  useClubRegistryNumbers: () => ({ data: [] }),
}));

const { useClubDetailsState } = await import('../useClubDetailsState');
const { ClubHeader } = await import('../ClubHeader');

const club = { id: CLUB_A, name: 'Heartland Club', authorizedAt: null } as unknown as Club;

function userWith(roles: UserRole[], scopes: RoleScope[] = []): UserWithRoles {
  return {
    id: 'auth-uid',
    email: 'u@example.test',
    roles,
    permissions: [],
    scopes,
  } as unknown as UserWithRoles;
}

function clubScope(scopeId: string, roleId: string): RoleScope {
  return {
    userId: 'auth-uid',
    roleId: roleId as UserRole,
    scopeType: ScopeType.CLUB,
    scopeId,
    createdAt: new Date(),
  };
}

function Harness() {
  const state = useClubDetailsState(club);
  return (
    <ClubHeader
      club={club}
      onEditPhoto={vi.fn()}
      onCoverUpload={vi.fn()}
      onCoverRemove={vi.fn()}
      isUploadingCover={false}
      canEditBranding={state.canEditBranding}
      canAuthorizeClub={state.canAuthorizeClub}
      isClubAuthorized={state.isClubAuthorized}
    />
  );
}

function renderPage() {
  return render(<Harness />, { initialRoute: `/clubs/${CLUB_A}` });
}

describe('unauthorized club notice is staff-only (MYK9-1314)', () => {
  beforeEach(() => {
    mockAuth.userWithRoles = null;
    mockAuth.user = null;
    validated.value = { status: 'ready', clubId: CLUB_A, clubName: 'Club', clubs: [] };
  });

  it('shows a club admin of this club the badge and the notice', async () => {
    mockAuth.user = { id: 'auth-uid' };
    mockAuth.userWithRoles = userWith(
      [UserRole.CLUB_ADMIN],
      [clubScope(CLUB_A, UserRole.CLUB_ADMIN)]
    );
    renderPage();
    expect(await screen.findByText(/Pending myK9 authorization/)).toBeInTheDocument();
    expect(screen.getByTestId('club-unauthorized-badge')).toBeInTheDocument();
  });

  it('shows an appointed secretary of this club the badge and the notice', async () => {
    mockAuth.user = { id: 'auth-uid' };
    mockAuth.userWithRoles = userWith(
      [UserRole.SECRETARY],
      [clubScope(CLUB_A, UserRole.SECRETARY)]
    );
    renderPage();
    expect(await screen.findByText(/Pending myK9 authorization/)).toBeInTheDocument();
    expect(screen.getByTestId('club-unauthorized-badge')).toBeInTheDocument();
  });

  it('shows a trial_secretary appointee of this club the badge and the notice', async () => {
    mockAuth.user = { id: 'auth-uid' };
    mockAuth.userWithRoles = userWith([UserRole.SECRETARY], [clubScope(CLUB_A, 'trial_secretary')]);
    renderPage();
    expect(await screen.findByText(/Pending myK9 authorization/)).toBeInTheDocument();
    expect(screen.getByTestId('club-unauthorized-badge')).toBeInTheDocument();
  });

  it('shows a site admin the badge and the notice', async () => {
    mockAuth.user = { id: 'auth-uid' };
    mockAuth.userWithRoles = userWith([UserRole.SITE_ADMIN]);
    renderPage();
    expect(await screen.findByText(/Pending myK9 authorization/)).toBeInTheDocument();
    expect(screen.getByTestId('club-unauthorized-badge')).toBeInTheDocument();
  });

  it.each([
    ['an exhibitor', userWith([UserRole.EXHIBITOR])],
    [
      'an admin of a different club',
      userWith([UserRole.CLUB_ADMIN], [clubScope(CLUB_B, UserRole.CLUB_ADMIN)]),
    ],
    [
      'an appointed secretary of a different club',
      userWith([UserRole.SECRETARY], [clubScope(CLUB_B, UserRole.SECRETARY)]),
    ],
    ['an anonymous visitor', null],
  ])('shows %s neither', async (_label, user) => {
    mockAuth.userWithRoles = user;
    renderPage();
    // Positive control: the hero rendered, so absence is not an empty page.
    expect(await screen.findByRole('heading', { name: 'Heartland Club' })).toBeInTheDocument();
    expect(screen.queryByText(/Pending myK9 authorization/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Unauthorized/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('club-unauthorized-badge')).not.toBeInTheDocument();
  });
});
