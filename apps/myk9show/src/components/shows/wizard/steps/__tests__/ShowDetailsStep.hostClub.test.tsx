/**
 * MYK9-887 / MYK9-889 through the real ShowDetailsStep: the club advisory and the existing-club
 * copy must survive the `clubCreateDenied` prop hop from the step into HostClubField.
 */
import { useLocation } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ScopeType, UserRole } from '@/types/auth-types';

const h = vi.hoisted(() => ({
  clubId: '',
  userWithRoles: null as unknown,
}));

vi.mock('@/store/wizardStore', () => ({
  useWizardStore: () => ({
    show: {
      name: '',
      organization: '',
      location: '',
      latitude: null,
      longitude: null,
      startDate: '',
      endDate: '',
      entryOpenDate: '',
      entryCloseDate: '',
      preEntryFee: 0,
      dayOfShowFee: 0,
      startingArmbandNumber: 100,
      clubId: h.clubId,
      officials: { secretary: [], chairman: [], steward: [] },
      judgeIds: [],
      acceptCheckPayments: false,
      acceptCashPayments: false,
    },
    trials: [],
    cloneHydration: { status: 'idle', sourceShowId: null, sourceShowName: null },
    updateShowData: vi.fn(),
    addJudgeToShow: vi.fn(),
    removeJudgeFromShow: vi.fn(),
    judgeDetails: {},
  }),
}));

const CLUBS = [
  { id: 'c1', name: 'Summit K9 Masters', address: { city: 'Denver', state: 'CO' } },
  { id: 'c2', name: 'Other Dog Club', address: { city: 'Boise', state: 'ID' } },
];

vi.mock('@/store/clubStore', () => {
  const useClubStore = Object.assign(
    vi.fn(() => ({
      clubs: CLUBS,
      loadClubs: vi.fn().mockResolvedValue(undefined),
      syncClubs: vi.fn(),
    })),
    { getState: () => ({ clubs: CLUBS }) }
  );
  return { useClubStore };
});
vi.mock('@/store/userStore', () => ({
  useUserStore: vi.fn(() => ({ people: [], loadPeople: vi.fn(), loadUsers: vi.fn() })),
}));
vi.mock('@/hooks/useUserClubIds', () => ({ useUserClubIds: () => null }));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ userWithRoles: h.userWithRoles, hasRole: () => false }),
}));
vi.mock('../CloneFromShowCombobox', () => ({ CloneFromShowCombobox: () => null }));
vi.mock('../CloneStatusBanner', () => ({ CloneStatusBanner: () => null }));
vi.mock('@/features/maps/VenueAddressAutocomplete', () => ({
  VenueAddressAutocomplete: () => <div />,
}));
vi.mock('@/components/common/LazyComponents', () => ({ VenuePinMap: () => null }));

import { ShowDetailsStep } from '../ShowDetailsStep';

const secretaryOf = (...clubIds: string[]) => ({
  id: 'auth-uid',
  roles: [UserRole.SECRETARY],
  permissions: [],
  scopes: clubIds.map(scopeId => ({
    userId: 'auth-uid',
    roleId: UserRole.SECRETARY,
    scopeType: ScopeType.CLUB,
    scopeId,
    createdAt: new Date(0),
  })),
});

function Probe() {
  const location = useLocation();
  return <div data-testid="search">{location.search}</div>;
}

const renderStep = (search: string) =>
  render(
    <>
      <ShowDetailsStep />
      <Probe />
    </>,
    { initialRoute: `/secretary/create-show/wizard${search}` }
  );

describe('ShowDetailsStep host club advisory (MYK9-887)', () => {
  beforeEach(() => {
    h.clubId = '';
    h.userWithRoles = null;
  });

  it('shows the advisory for a club the secretary is not appointed to, never as an alert', () => {
    h.clubId = 'c2';
    h.userWithRoles = secretaryOf('c1');
    renderStep('?clubId=c2');
    expect(screen.getByRole('status')).toHaveTextContent(
      /not a club admin or appointed secretary for Other Dog Club/i
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows nothing for a club the user is appointed to', () => {
    h.clubId = 'c2';
    h.userWithRoles = secretaryOf('c2');
    renderStep('?clubId=c2');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('stays silent for a just-created club, and the silence survives a Next then Back remount', () => {
    h.clubId = 'c2';
    h.userWithRoles = secretaryOf('c1');
    const { unmount } = renderStep('?clubId=c2&clubCreated=1');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    unmount();

    // Back to the step: a fresh mount on the same, unchanged URL.
    renderStep('?clubId=c2&clubCreated=1');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('?clubId=c2&clubCreated=1');
  });

  it('advises for the flagged URL once another club is selected', () => {
    h.clubId = 'c1';
    h.userWithRoles = secretaryOf('c2');
    renderStep('?clubId=c2&clubCreated=1');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('ShowDetailsStep opened from an existing club (MYK9-889)', () => {
  it('names the preselected host club and presents creating a new club as unnecessary', () => {
    h.clubId = 'c1';
    h.userWithRoles = secretaryOf('c1');
    renderStep('?clubId=c1');
    expect(screen.getByText(/Hosting club: Summit K9 Masters/)).toBeInTheDocument();
    expect(screen.getByText(/nothing to create/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /not the right club\? create new club/i })
    ).toBeVisible();
  });
});
