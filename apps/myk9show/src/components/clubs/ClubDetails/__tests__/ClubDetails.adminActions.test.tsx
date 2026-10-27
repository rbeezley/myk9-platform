/**
 * MYK9-1293: Members and Payments are tabs on the club page, not Actions-menu links. Goes through
 * the real hook: `canManageClubAdmin` is what shows the Payments tab and the members manager,
 * and `?tab=payments` must fall back for anyone else.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { ScopeType, UserRole } from '@/types/auth-types';
import type { RoleScope, UserWithRoles } from '@/types/auth-types';
import type { Club } from '@/types/club-types';
import type { ValidatedClubContext } from '@/hooks/useValidatedClubContext';

const CLUB_A = '11111111-1111-4111-8111-111111111111';
const CLUB_B = '22222222-2222-4222-8222-222222222222';

const mockAuth = vi.hoisted(() => ({
  userWithRoles: null as UserWithRoles | null,
  user: { id: 'auth-uid' },
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
const store = vi.hoisted(() => ({
  updateClub: () => {},
  selectClub: vi.fn(),
  selectedClubId: null as string | null,
  selectedClubUserId: null as string | null,
}));
vi.mock('@/store/clubStore', () => ({ useClubStore: () => store }));
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

const { useClubDetailsState } = await import('../useClubDetailsState');
const { HeaderActions } = await import('@/components/layout/HeaderActions');
const { usePageEditTargetStore } = await import('@/features/actions/pageEditTarget');

function adminOf(clubId: string): UserWithRoles {
  const scope: RoleScope = {
    userId: 'auth-uid',
    roleId: UserRole.CLUB_ADMIN,
    scopeType: ScopeType.CLUB,
    scopeId: clubId,
    createdAt: new Date(),
  };
  return {
    id: 'auth-uid',
    email: 'admin@example.test',
    roles: [UserRole.CLUB_ADMIN],
    permissions: [],
    scopes: [scope],
  } as unknown as UserWithRoles;
}

function ready(clubId: string): ValidatedClubContext {
  return { status: 'ready', clubId, clubName: 'Club', clubs: [] };
}

function Harness({ clubId }: { clubId: string }) {
  const state = useClubDetailsState({ id: clubId, name: 'Heartland Club' } as Club);
  return (
    <>
      <HeaderActions />
      <p data-testid="can-manage">{String(state.canManageClubAdmin)}</p>
      <p data-testid="active-tab">{state.activeTab}</p>
    </>
  );
}

function renderPage(clubId: string, search = '') {
  return render(<Harness clubId={clubId} />, { initialRoute: `/clubs/${clubId}${search}` });
}

describe('club page admin tabs (MYK9-1293)', () => {
  beforeEach(() => {
    mockAuth.userWithRoles = null;
    mockAuth.rbacLoading = false;
    validated.value = { status: 'loading' };
    usePageEditTargetStore.setState({ target: null, owner: null, exports: [] });
  });

  it('lets an admin of this club manage it, and lands ?tab=payments on Payments', async () => {
    mockAuth.userWithRoles = adminOf(CLUB_A);
    validated.value = ready(CLUB_A);
    renderPage(CLUB_A, '?tab=payments');

    expect(await screen.findByTestId('can-manage')).toHaveTextContent('true');
    expect(screen.getByTestId('active-tab')).toHaveTextContent('payments');
  });

  it('keeps ?tab=payments while roles load, then lands an admin on Payments (cold Stripe return)', async () => {
    mockAuth.rbacLoading = true;
    validated.value = ready(CLUB_A);
    const { rerender } = renderPage(CLUB_A, '?connect=return&tab=payments');
    await screen.findByTestId('can-manage');

    mockAuth.rbacLoading = false;
    mockAuth.userWithRoles = adminOf(CLUB_A);
    rerender(<Harness clubId={CLUB_A} />);

    await waitFor(() => expect(screen.getByTestId('can-manage')).toHaveTextContent('true'));
    expect(screen.getByTestId('active-tab')).toHaveTextContent('payments');
  });

  it('no longer lists Manage members or Payments in the Actions menu', async () => {
    mockAuth.userWithRoles = adminOf(CLUB_A);
    validated.value = ready(CLUB_A);
    renderPage(CLUB_A);
    await userEvent.click(await screen.findByTestId('header-actions-trigger'));

    // Edit is the positive control that the menu opened.
    expect(await screen.findByRole('menuitem', { name: /Edit/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Manage members/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Payments/ })).not.toBeInTheDocument();
  });

  it('lets an admin of clubs A and B manage A while the store selection is on B', async () => {
    const both = adminOf(CLUB_A);
    both.scopes = [...both.scopes, ...adminOf(CLUB_B).scopes];
    mockAuth.userWithRoles = both;
    validated.value = ready(CLUB_B);
    renderPage(CLUB_A, '?tab=payments');

    expect(await screen.findByTestId('can-manage')).toHaveTextContent('true');
    expect(screen.getByTestId('active-tab')).toHaveTextContent('payments');
  });

  it('makes A the selected admin club when an admin of A and B opens A, so My Club follows it', async () => {
    const both = adminOf(CLUB_A);
    both.scopes = [...both.scopes, ...adminOf(CLUB_B).scopes];
    mockAuth.userWithRoles = both;
    validated.value = ready(CLUB_B);
    store.selectedClubId = CLUB_B;
    store.selectClub.mockClear();
    renderPage(CLUB_A);

    await screen.findByTestId('can-manage');
    expect(store.selectClub).toHaveBeenCalledWith(CLUB_A, 'auth-uid');
  });

  it('makes the opened club the selection for a site admin too', async () => {
    const site = adminOf(CLUB_B);
    site.roles = [UserRole.SITE_ADMIN];
    site.scopes = [];
    mockAuth.userWithRoles = site;
    validated.value = ready(CLUB_B);
    store.selectedClubId = CLUB_B;
    store.selectedClubUserId = 'auth-uid';
    store.selectClub.mockClear();
    renderPage(CLUB_A);

    await screen.findByTestId('can-manage');
    expect(store.selectClub).toHaveBeenCalledWith(CLUB_A, 'auth-uid');
  });

  it('records the current user when the same club was last selected by someone else', async () => {
    mockAuth.userWithRoles = adminOf(CLUB_A);
    validated.value = ready(CLUB_A);
    store.selectedClubId = CLUB_A;
    store.selectedClubUserId = 'another-user';
    store.selectClub.mockClear();
    renderPage(CLUB_A);

    await screen.findByTestId('can-manage');
    expect(store.selectClub).toHaveBeenCalledWith(CLUB_A, 'auth-uid');
  });

  it('does not re-select when this user already selected this club', async () => {
    mockAuth.userWithRoles = adminOf(CLUB_A);
    validated.value = ready(CLUB_A);
    store.selectedClubId = CLUB_A;
    store.selectedClubUserId = 'auth-uid';
    store.selectClub.mockClear();
    renderPage(CLUB_A);

    await screen.findByTestId('can-manage');
    expect(store.selectClub).not.toHaveBeenCalled();
  });

  it('leaves the selected admin club alone for a viewer who does not administer this club', async () => {
    mockAuth.userWithRoles = adminOf(CLUB_B);
    validated.value = ready(CLUB_B);
    store.selectedClubId = CLUB_B;
    store.selectClub.mockClear();
    renderPage(CLUB_A);

    await screen.findByTestId('can-manage');
    expect(store.selectClub).not.toHaveBeenCalled();
  });

  it('lets a site admin with no club_admin scope manage any club, as /club-admin/* admitted them', async () => {
    const site = adminOf(CLUB_B);
    site.roles = [UserRole.SITE_ADMIN];
    site.scopes = [];
    mockAuth.userWithRoles = site;
    validated.value = ready(CLUB_B);
    renderPage(CLUB_A, '?tab=payments');

    expect(await screen.findByTestId('can-manage')).toHaveTextContent('true');
    expect(screen.getByTestId('active-tab')).toHaveTextContent('payments');
  });

  it.each([
    ['an admin of club B viewing club A', CLUB_A, adminOf(CLUB_B)],
    ['a viewer without the club_admin scope', CLUB_A, null],
  ])('%s cannot manage, and ?tab=payments falls back to Upcoming', async (_l, club, user) => {
    mockAuth.userWithRoles = user;
    validated.value = ready(CLUB_A);
    renderPage(club, '?tab=payments');

    expect(await screen.findByTestId('can-manage')).toHaveTextContent('false');
    expect(screen.getByTestId('active-tab')).toHaveTextContent('upcoming');
  });
});
