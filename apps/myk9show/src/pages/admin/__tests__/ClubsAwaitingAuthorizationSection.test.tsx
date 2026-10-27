import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { Club } from '@/types/club-types';
import { ClubsAwaitingAuthorizationSection } from '../ClubsAwaitingAuthorizationSection';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock('@/hooks/queries/useClubsDatabase', () => ({
  useClubsAwaitingAuthorizationQuery: mocks.query,
}));

function makeClub(overrides: Partial<Club> & { id: string; name: string }): Club {
  return {
    clubNumber: '',
    email: '',
    phone: '',
    description: '',
    logo: '',
    address: { street: '', city: '', state: '', zipCode: '', country: 'US' },
    upcomingShows: [],
    pastShows: [],
    ...overrides,
  } as Club;
}

function answer(state: { data?: Club[]; isPending?: boolean; isError?: boolean }) {
  mocks.query.mockReturnValue({
    data: state.data,
    isPending: state.isPending ?? false,
    isError: state.isError ?? false,
    refetch: mocks.refetch,
  });
}

describe('ClubsAwaitingAuthorizationSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    answer({ data: [] });
  });

  it('lists every club the server returned as pending, each linking to its club page', () => {
    answer({
      data: [
        makeClub({
          id: 'p-1',
          name: 'Pending Club',
          authorizedAt: null,
          createdAt: '2026-09-24T12:00:00Z',
        }),
      ],
    });

    render(<ClubsAwaitingAuthorizationSection />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/clubs/p-1');
    expect(screen.getByText('Pending Club')).toBeInTheDocument();
  });

  it('says every club is authorized when none are pending', () => {
    answer({ data: [] });

    render(<ClubsAwaitingAuthorizationSection />);

    expect(screen.getByText('All clubs are authorized.')).toBeInTheDocument();
  });

  it('shows a loading line, not an answer, before clubs load', () => {
    answer({ isPending: true });

    render(<ClubsAwaitingAuthorizationSection />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading clubs');
    expect(screen.queryByText('All clubs are authorized.')).not.toBeInTheDocument();
  });

  it('never says every club is authorized when clubs could not load, and offers a retry', async () => {
    answer({ isError: true });

    const { user } = render(<ClubsAwaitingAuthorizationSection />);

    expect(screen.queryByText('All clubs are authorized.')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load clubs");
    mocks.refetch.mockClear();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it('refetches on every visit, even with a cached list', () => {
    answer({ data: [] });

    render(<ClubsAwaitingAuthorizationSection />);

    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  describe('folded notice link (MYK9-1395)', () => {
    const CREATOR = '00000000-0000-0000-0000-000000000104';

    it('narrows the list to the creator named in ?creator= and offers the full list', () => {
      render(<ClubsAwaitingAuthorizationSection />, {
        initialRoute: `/admin/onboarding?creator=${CREATOR}`,
      });

      expect(mocks.query).toHaveBeenCalledWith(CREATOR);
      expect(
        screen.getByRole('link', { name: 'Show all clubs awaiting authorization' })
      ).toHaveAttribute('href', '/admin/onboarding');
    });

    it('ignores a ?creator= value that is not a uuid', () => {
      render(<ClubsAwaitingAuthorizationSection />, {
        initialRoute: '/admin/onboarding?creator=not-a-uuid',
      });

      expect(mocks.query).toHaveBeenCalledWith(undefined);
      expect(
        screen.queryByRole('link', { name: 'Show all clubs awaiting authorization' })
      ).not.toBeInTheDocument();
    });
  });
});
