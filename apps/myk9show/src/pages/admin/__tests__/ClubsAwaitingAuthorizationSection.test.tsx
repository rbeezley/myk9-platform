import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { Club } from '@/types/club-types';
import { ClubsAwaitingAuthorizationSection } from '../ClubsAwaitingAuthorizationSection';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock('@/hooks/queries/useClubsDatabase', () => ({
  useClubsQuery: mocks.query,
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

  it('lists only clubs whose authorizedAt is explicitly null, each linking to its club page', () => {
    answer({
      data: [
        makeClub({
          id: 'p-1',
          name: 'Pending Club',
          authorizedAt: null,
          createdAt: '2026-09-24T12:00:00Z',
        }),
        makeClub({ id: 'ok-1', name: 'Authorized Club', authorizedAt: '2026-09-01T00:00:00Z' }),
        makeClub({ id: 'u-1', name: 'Unknown Club', authorizedAt: undefined }),
      ],
    });

    render(<ClubsAwaitingAuthorizationSection />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/clubs/p-1');
    expect(screen.getByText('Pending Club')).toBeInTheDocument();
    expect(screen.queryByText('Authorized Club')).not.toBeInTheDocument();
    expect(screen.queryByText('Unknown Club')).not.toBeInTheDocument();
  });

  it('says every club is authorized when none are pending', () => {
    answer({
      data: [
        makeClub({ id: 'ok-1', name: 'Authorized Club', authorizedAt: '2026-09-01T00:00:00Z' }),
      ],
    });

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
    answer({
      data: [
        makeClub({ id: 'ok-1', name: 'Authorized Club', authorizedAt: '2026-09-01T00:00:00Z' }),
      ],
    });

    render(<ClubsAwaitingAuthorizationSection />);

    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });
});
