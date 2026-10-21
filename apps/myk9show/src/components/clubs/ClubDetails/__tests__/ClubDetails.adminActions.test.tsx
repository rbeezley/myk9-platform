/**
 * MYK9-1293: the rail's My Club link opens the club page, so the members and payments pages
 * the old flyout listed must be reachable from that page's header Actions menu. Goes through
 * the real hook and the real menu: the pure builder's own tests cannot see a dropped input or
 * a swapped route.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { render, screen } from '@/test/utils/testUtils';
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
vi.mock('@/store/clubStore', () => ({ useClubStore: () => ({ updateClub: vi.fn() }) }));
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
  useClubDetailsState({ id: clubId, name: 'Heartland Club' } as Club);
  const { pathname } = useLocation();
  return (
    <>
      <HeaderActions />
      <p data-testid="location">{pathname}</p>
    </>
  );
}

function renderPage(clubId: string) {
  return render(<Harness clubId={clubId} />, { initialRoute: `/clubs/${clubId}` });
}

async function openMenu() {
  await userEvent.click(await screen.findByTestId('header-actions-trigger'));
}

describe('club page Actions menu: Manage members and Payments (MYK9-1293)', () => {
  beforeEach(() => {
    mockAuth.userWithRoles = null;
    validated.value = { status: 'loading' };
    usePageEditTargetStore.setState({ target: null, owner: null, exports: [] });
  });

  it('offers a club admin of this club both entries, and each opens its page', async () => {
    mockAuth.userWithRoles = adminOf(CLUB_A);
    validated.value = ready(CLUB_A);
    renderPage(CLUB_A);
    await openMenu();

    expect(await screen.findByRole('menuitem', { name: /Payments/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: /Manage members/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/club-admin/members');
  });

  it('opens Payments at the payments page', async () => {
    mockAuth.userWithRoles = adminOf(CLUB_A);
    validated.value = ready(CLUB_A);
    renderPage(CLUB_A);
    await openMenu();

    await userEvent.click(await screen.findByRole('menuitem', { name: /Payments/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/club-admin/payments');
  });

  it.each([
    ['a viewer without the club_admin scope', null, ready(CLUB_A)],
    ['an admin of this club while the validated club is another', adminOf(CLUB_B), ready(CLUB_A)],
    ['an admin whose club context is still resolving', adminOf(CLUB_A), { status: 'loading' }],
  ] as const)('offers neither to %s', async (_label, user, context) => {
    mockAuth.userWithRoles = user;
    validated.value = context as ValidatedClubContext;
    renderPage(CLUB_B);
    // Nothing else registers for this viewer, so the Actions button may be absent.
    expect(screen.queryByRole('menuitem', { name: /Manage members/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Payments/ })).not.toBeInTheDocument();
  });

  it('offers neither to an admin of club B viewing club B while the validated club is A', async () => {
    mockAuth.userWithRoles = adminOf(CLUB_B);
    validated.value = ready(CLUB_A);
    renderPage(CLUB_B);
    // Edit club still registers for this admin, so the menu exists and must lack both.
    await openMenu();

    expect(await screen.findByRole('menuitem', { name: /Edit/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Manage members/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Payments/ })).not.toBeInTheDocument();
  });
});
