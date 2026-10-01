import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { render, screen } from '@/test/utils/testUtils';
import { useClubStore } from '@/store/clubStore';
import type { Club } from '@/types/club-types';
import { ClubsAwaitingAuthorizationSection } from '../ClubsAwaitingAuthorizationSection';

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

function seed(
  clubs: Club[],
  clubReadiness: 'loading' | 'fresh' | 'offline' | 'unavailable' = 'fresh'
) {
  useClubStore.setState({
    clubs,
    clubReadiness,
    ensureClubsReady: vi.fn().mockResolvedValue({ status: 'fresh', clubs }),
  });
}

describe('ClubsAwaitingAuthorizationSection', () => {
  beforeEach(() => {
    seed([]);
  });

  it('lists only clubs whose authorizedAt is explicitly null, each linking to its club page', () => {
    seed([
      makeClub({
        id: 'pending-1',
        name: 'Heartland Scent Work Club',
        authorizedAt: null,
        createdAt: '2026-09-19T12:00:00Z',
      }),
      makeClub({ id: 'ok-1', name: 'Authorized Club', authorizedAt: '2026-09-01T00:00:00Z' }),
      makeClub({ id: 'unknown-1', name: 'Not Synced Yet Club' }),
    ]);

    render(<ClubsAwaitingAuthorizationSection />);

    expect(screen.getByText('Heartland Scent Work Club')).toBeInTheDocument();
    expect(screen.getByText(/Created/)).toBeInTheDocument();
    expect(screen.queryByText('Authorized Club')).not.toBeInTheDocument();
    expect(screen.queryByText('Not Synced Yet Club')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open Heartland Scent Work Club to authorize it' })
    ).toHaveAttribute('href', '/clubs/pending-1');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('says every club is authorized when none are pending', () => {
    seed([makeClub({ id: 'ok-1', name: 'Authorized Club', authorizedAt: '2026-09-01T00:00:00Z' })]);

    render(<ClubsAwaitingAuthorizationSection />);

    expect(screen.getByText('All clubs are authorized.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it.each(['unavailable', 'offline'] as const)(
    'never says every club is authorized when clubs could not load (%s)',
    async readiness => {
      seed([], readiness);

      const { user } = render(<ClubsAwaitingAuthorizationSection />);

      expect(screen.queryByText('All clubs are authorized.')).not.toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load clubs");
      await user.click(screen.getByRole('button', { name: 'Try again' }));
      expect(useClubStore.getState().ensureClubsReady).toHaveBeenCalledWith({ force: true });
    }
  );

  it('marks a cached list as unrefreshed when the sync failed, with the same retry', async () => {
    seed([makeClub({ id: 'p-1', name: 'Pending Club', authorizedAt: null })], 'unavailable');

    const { user } = render(<ClubsAwaitingAuthorizationSection />);

    expect(screen.getByRole('alert')).toHaveTextContent("this device's last sync");
    expect(screen.getByRole('link', { name: /Open Pending Club/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(useClubStore.getState().ensureClubsReady).toHaveBeenCalledWith({ force: true });
  });

  it('does not claim every club is authorized from a stale cache', () => {
    seed(
      [makeClub({ id: 'ok-1', name: 'Authorized Club', authorizedAt: '2026-09-01T00:00:00Z' })],
      'offline'
    );

    render(<ClubsAwaitingAuthorizationSection />);

    expect(screen.queryByText('All clubs are authorized.')).not.toBeInTheDocument();
    expect(
      screen.getByText('No clubs were awaiting authorization at the last sync.')
    ).toBeInTheDocument();
  });

  it('shows a loading line before any clubs have loaded', () => {
    seed([], 'loading');

    render(<ClubsAwaitingAuthorizationSection />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading clubs');
    expect(screen.queryByText('All clubs are authorized.')).not.toBeInTheDocument();
  });

  it('drops a club from the list when the store reports it authorized', async () => {
    const club = makeClub({
      id: 'pending-1',
      name: 'Prairie Trail Dog Sports Club',
      authorizedAt: null,
    });
    seed([club]);
    render(<ClubsAwaitingAuthorizationSection />);
    expect(screen.getByText('Prairie Trail Dog Sports Club')).toBeInTheDocument();

    act(() => {
      useClubStore.setState({ clubs: [{ ...club, authorizedAt: '2026-10-01T00:00:00Z' }] });
    });

    expect(await screen.findByText('All clubs are authorized.')).toBeInTheDocument();
    expect(screen.queryByText('Prairie Trail Dog Sports Club')).not.toBeInTheDocument();
  });
});
