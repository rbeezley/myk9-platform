import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { render } from '@/test/utils/testUtils';
import DogDetailsMain from '../index';
import type { Dog } from '@/types/dog-types';

// Review round 4 (#2670): identity and RBAC load separately from the page, so a real owner
// is briefly a "non-owner". The page must wait (`pending`), and the ?addRegistration=true
// deep link must survive that wait. Loading shapes are AuthContext's real ones:
// personIdentityState 'unresolved' | 'resolved' | 'missing', rbacLoading, cached personId.
const OWNER_PERSON_ID = '11111111-0000-4000-8000-0000000000a1';
const OTHER_PERSON_ID = '11111111-0000-4000-8000-0000000000a3';
const VIEWER_AUTH_UID = '99999999-0000-4000-8000-0000000000f1';

const dog: Dog = {
  id: 'dededede-0000-0000-0000-000000000041',
  name: 'Willow',
  callName: 'Willow',
  breed: 'Border Collie',
  sex: 'female',
  ownerId: OWNER_PERSON_ID,
  status: 'active',
};

interface AuthShape {
  roles: string[];
  rbacLoading: boolean;
  personIdentityState: 'unresolved' | 'resolved' | 'missing';
  personId: string | null;
  databaseUserId: string | undefined;
}
let auth: AuthShape;

vi.mock('@/store/userStore', () => ({
  useUserStore: (selector: (s: { people: unknown[] }) => unknown) => selector({ people: [] }),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    isAdmin: false,
    userWithRoles: { id: VIEWER_AUTH_UID, databaseUserId: auth.databaseUserId, scopes: [] },
    getUserRoles: () => auth.roles,
    hasRole: (role: string) => auth.roles.includes(role),
    rbacLoading: auth.rbacLoading,
    personIdentityState: auth.personIdentityState,
    personId: auth.personId,
  }),
  getPrimaryRole: (roles: string[]) => (roles.includes('secretary') ? 'secretary' : 'exhibitor'),
}));
vi.mock('@/hooks/useValidatedClubContext', () => ({
  useCurrentValidatedClubContext: () => ({ status: 'loading' }),
}));
vi.mock('@/hooks/useRoleBasedData', () => ({ useCanDeleteDog: () => false }));
vi.mock('@/hooks/useBreadcrumb', () => ({ useBreadcrumb: () => [] }));
vi.mock('@/services/LoggingService', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/hooks/queries/useRegistrationsDatabase', () => ({
  useRegistrationsByDogQuery: () => ({ data: [], isLoading: false }),
  useDogRegistrationManagement: () => ({
    registrations: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/components/dogs/DogDetails/Registrations/ManageRegistrationsPanel', () => ({
  default: () => null,
}));
vi.mock('@/components/dogs/DogDetails/Registrations/DogRegistrationDialogs', () => ({
  default: ({ autoOpenAddDialog }: { autoOpenAddDialog: boolean }) => (
    <div data-testid="registration-dialogs" data-auto-open={String(autoOpenAddDialog)} />
  ),
}));
vi.mock('@/hooks/useSubscriptionGate', () => ({
  useSubscriptionGate: () => ({ isPremium: false, canAuthorizePremium: false, isLoading: false }),
}));
vi.mock('../ActivityTab', () => ({ default: () => null }));
vi.mock('../TitleProgressSection', () => ({ default: () => null }));
vi.mock('../CareerSection', () => ({ default: () => null }));
vi.mock('../RecordsSection', () => ({ default: () => null }));
vi.mock('@/components/dogs/DogDetails/Registrations/RegistrationsSection', () => ({
  default: () => null,
}));
vi.mock('../DogDialogs', () => ({ default: () => null }));
vi.mock('@/components/dogs/DogStatusDialog', () => ({ default: () => null }));
vi.mock('@/components/common/Breadcrumb', () => ({ default: () => <nav /> }));

const Probe = () => <div data-testid="search">{useLocation().search}</div>;
const ui = () => (
  <>
    <DogDetailsMain dog={dog} />
    <Probe />
  </>
);
const route = { initialRoute: '/dogs/x?addRegistration=true' };

const pendingAuth = (roles: string[]): AuthShape => ({
  roles,
  rbacLoading: true,
  personIdentityState: 'unresolved',
  personId: null,
  databaseUserId: undefined,
});
const resolvedAs = (roles: string[], personId: string): AuthShape => ({
  roles,
  rbacLoading: false,
  personIdentityState: 'resolved',
  personId,
  databaseUserId: personId,
});

const hasFullView = () => screen.queryByRole('tab', { name: 'Overview' }) !== null;
const hasIdentityRail = () => document.querySelector('[data-dog-identity]') !== null;
const setOnline = (value: boolean) =>
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });

describe('DogDetailsMain — identity pending is its own state', () => {
  beforeEach(() => {
    auth = pendingAuth(['club_admin']);
    setOnline(true);
  });
  afterEach(() => {
    setOnline(true);
    vi.useRealTimers();
  });

  it('renders neither layout nor any control while identity is pending, and keeps the deep link', () => {
    render(ui(), route);
    expect(screen.getByRole('status', { name: 'Loading dog' })).toBeInTheDocument();
    expect(hasIdentityRail()).toBe(false);
    expect(hasFullView()).toBe(false);
    expect(screen.queryByTestId('registration-dialogs')).toBeNull();
    expect(screen.getByTestId('search')).toHaveTextContent('addRegistration=true');
  });

  it.each([
    ['club admin owner', ['club_admin']],
    ['secretary owner', ['secretary']],
  ])('pending -> owner: the deep link opens the add dialog for a %s', (_l, roles) => {
    auth = pendingAuth(roles);
    const { rerender } = render(ui(), route);
    expect(screen.getByTestId('search')).toHaveTextContent('addRegistration=true');

    auth = resolvedAs(roles, OWNER_PERSON_ID);
    rerender(ui());

    expect(hasFullView()).toBe(true);
    expect(screen.getByTestId('registration-dialogs')).toHaveAttribute('data-auto-open', 'true');
    expect(screen.getByTestId('search')).not.toHaveTextContent('addRegistration');
  });

  it('pending -> non-owner club admin: strips the param and opens nothing', () => {
    const { rerender } = render(ui(), route);
    auth = resolvedAs(['club_admin'], OTHER_PERSON_ID);
    rerender(ui());

    expect(hasFullView()).toBe(false);
    expect(hasIdentityRail()).toBe(true);
    expect(screen.queryByTestId('registration-dialogs')).toBeNull();
    expect(screen.getByTestId('search')).not.toHaveTextContent('addRegistration');
  });

  it('does not return to pending when RBAC refreshes after the page resolved', () => {
    auth = resolvedAs(['club_admin'], OWNER_PERSON_ID);
    const { rerender } = render(ui(), { initialRoute: '/dogs/x' });
    expect(hasFullView()).toBe(true);
    auth = { ...auth, rbacLoading: true };
    rerender(ui());
    expect(hasFullView()).toBe(true);
    expect(screen.queryByRole('status', { name: 'Loading dog' })).toBeNull();
  });

  describe('cold offline boot', () => {
    it('uses the cached person id while the lookup is unresolved', () => {
      setOnline(false);
      auth = { ...pendingAuth(['club_admin']), rbacLoading: false, personId: OWNER_PERSON_ID };
      render(ui(), { initialRoute: '/dogs/x' });
      expect(hasFullView()).toBe(true);
    });

    it('does not stick on pending with no cached identity: falls back to the narrow read-only view', () => {
      setOnline(false);
      auth = pendingAuth(['club_admin']);
      render(ui(), route);
      expect(screen.queryByRole('status', { name: 'Loading dog' })).toBeNull();
      expect(hasFullView()).toBe(false);
      expect(hasIdentityRail()).toBe(true);
      expect(screen.queryByTestId('registration-dialogs')).toBeNull();
    });

    it('stops waiting after the timeout when online but the lookup never completes', () => {
      vi.useFakeTimers();
      render(ui(), route);
      expect(screen.getByRole('status', { name: 'Loading dog' })).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(screen.queryByRole('status', { name: 'Loading dog' })).toBeNull();
      expect(hasIdentityRail()).toBe(true);
    });
  });
});
