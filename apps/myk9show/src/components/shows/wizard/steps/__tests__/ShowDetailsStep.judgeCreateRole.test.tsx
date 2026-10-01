/**
 * MYK9-908: the wizard offers "Add new judge" (person, then judge qualification) only
 * to roles RLS lets write judge_qualifications. A club admin can open the wizard
 * (#2613) but would get the person created and the qualification refused.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';

const h = vi.hoisted(() => ({
  roles: [] as string[],
  pickerProps: null as null | { onCreateJudge?: unknown; onSaveCredentials?: unknown },
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
      clubId: '',
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
vi.mock('@/store/clubStore', () => {
  const useClubStore = Object.assign(
    vi.fn(() => ({
      clubs: [],
      loadClubs: vi.fn().mockResolvedValue(undefined),
      syncClubs: vi.fn(),
    })),
    { getState: () => ({ clubs: [] }) }
  );
  return { useClubStore };
});
vi.mock('@/store/userStore', () => ({
  useUserStore: vi.fn(() => ({ people: [], loadPeople: vi.fn(), loadUsers: vi.fn() })),
}));
vi.mock('@/hooks/useUserClubIds', () => ({ useUserClubIds: () => null }));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: null,
    hasRole: (role: string) => h.roles.includes(role),
  }),
}));
vi.mock('../CloneFromShowCombobox', () => ({ CloneFromShowCombobox: () => null }));
vi.mock('../CloneStatusBanner', () => ({ CloneStatusBanner: () => null }));
vi.mock('@/features/maps/VenueAddressAutocomplete', () => ({
  VenueAddressAutocomplete: () => <div />,
}));
vi.mock('@/components/common/LazyComponents', () => ({ VenuePinMap: () => null }));
vi.mock('../JudgesPicker', () => ({
  JudgesPicker: (props: { onCreateJudge?: unknown; onSaveCredentials?: unknown }) => {
    h.pickerProps = props;
    return null;
  },
}));

import { ShowDetailsStep } from '../ShowDetailsStep';

describe('ShowDetailsStep: who may create a judge inline (MYK9-908)', () => {
  beforeEach(() => {
    h.roles = [];
    h.pickerProps = null;
  });

  it('withholds the create handler from a club admin without secretary or site admin', () => {
    h.roles = [UserRole.CLUB_ADMIN];
    render(<ShowDetailsStep />);
    expect(h.pickerProps).not.toBeNull();
    expect(h.pickerProps?.onCreateJudge).toBeUndefined();
    expect(h.pickerProps?.onSaveCredentials).toBeUndefined();
  });

  it.each([UserRole.SECRETARY, UserRole.SITE_ADMIN])('passes the create handler to %s', role => {
    h.roles = [role];
    render(<ShowDetailsStep />);
    expect(h.pickerProps?.onCreateJudge).toBeTypeOf('function');
    expect(h.pickerProps?.onSaveCredentials).toBeTypeOf('function');
  });
});
