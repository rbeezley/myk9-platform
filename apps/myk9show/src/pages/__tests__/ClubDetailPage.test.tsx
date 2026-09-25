import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import type { Club } from '@/types/club-types';
import ClubDetailPage from '../ClubDetailPage';

const state = vi.hoisted(() => ({
  clubs: [] as Club[],
  clubReadiness: 'loading' as 'loading' | 'fresh' | 'offline' | 'unavailable',
  ensureClubsReady: vi.fn(() => Promise.resolve({ status: 'fresh', clubs: [] })),
  // Counts every read of the replica's club list, so a test can prove a
  // signed-out viewer never consults it.
  replicaReads: 0,
}));

const auth = vi.hoisted(() => ({
  value: {
    user: { id: 'user-1', is_anonymous: false },
    userWithRoles: { roles: ['secretary'] },
    loading: false,
  } as {
    user: { id: string; is_anonymous?: boolean } | null;
    userWithRoles: { roles: string[] } | null;
    loading: boolean;
  },
}));

const getPublicClubById = vi.hoisted(() => vi.fn());

vi.mock('@/store/clubStore', () => ({
  useClubStore: (selector: (value: Record<string, unknown>) => unknown) =>
    selector({
      clubReadiness: state.clubReadiness,
      ensureClubsReady: state.ensureClubsReady,
      get clubs() {
        state.replicaReads += 1;
        return state.clubs;
      },
    }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => auth.value,
}));

vi.mock('@/services/database/clubs', () => ({
  getPublicClubById,
}));

vi.mock('@/components/clubs/ClubDetails', () => ({
  ClubDetails: ({ selectedClub }: { selectedClub: Club | null }) => (
    <div data-testid="club-details">{selectedClub?.name ?? 'no club'}</div>
  ),
}));

vi.mock('@/components/common/SkeletonLoaders', () => ({
  DetailPageSkeleton: () => <div data-testid="detail-skeleton">Loading...</div>,
}));

const club: Club = {
  id: 'club-1',
  name: 'Heartland Club',
  clubNumber: '',
  email: '',
  phone: '',
  website: undefined,
  description: '',
  address: { street: '', city: 'Tulsa', state: 'OK', zipCode: '', country: 'US' },
  logo: '',
  coverImage: '',
  accentColor: '',
  upcomingShows: [],
  pastShows: [],
};

function renderPage(path: string) {
  return render(
    <Routes>
      <Route path="/clubs/:id" element={<ClubDetailPage />} />
    </Routes>,
    { initialRoute: path }
  );
}

beforeEach(() => {
  state.clubs = [];
  state.clubReadiness = 'loading';
  state.ensureClubsReady.mockClear();
  state.replicaReads = 0;
  getPublicClubById.mockReset();
  auth.value = {
    user: { id: 'user-1', is_anonymous: false },
    userWithRoles: { roles: ['secretary'] },
    loading: false,
  };
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('ClubDetailPage signed-in readiness outcomes', () => {
  it('renders the replica club and passes its requested ID to readiness', () => {
    state.clubs = [club];
    state.clubReadiness = 'fresh';

    renderPage('/clubs/club-1');

    expect(screen.getByTestId('club-details')).toHaveTextContent('Heartland Club');
    expect(state.ensureClubsReady).toHaveBeenCalledWith({ requestedClubId: 'club-1' });
    expect(getPublicClubById).not.toHaveBeenCalled();
  });

  it('waits in loading when the requested ID is absent from stale cache', () => {
    state.clubs = [{ ...club, id: 'other-club', name: 'Other Club' }];

    renderPage('/clubs/club-1');

    expect(screen.queryByTestId('club-details')).not.toBeInTheDocument();
    expect(state.ensureClubsReady).toHaveBeenCalledWith({ requestedClubId: 'club-1' });
  });

  it('renders an in-page not-found outcome after a fresh sync', () => {
    state.clubReadiness = 'fresh';

    renderPage('/clubs/missing-club');

    expect(screen.getByRole('heading', { name: 'Club not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to clubs' })).toHaveAttribute('href', '/clubs');
  });

  it('renders retryable unavailable copy without exposing internal failure details', async () => {
    state.clubReadiness = 'unavailable';

    const { user } = renderPage('/clubs/missing-club');

    expect(
      screen.getByRole('heading', { name: 'Club details are unavailable' })
    ).toBeInTheDocument();
    expect(screen.queryByText(/supabase|timeout|secret/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(state.ensureClubsReady).toHaveBeenCalledWith({
      requestedClubId: 'missing-club',
      force: true,
    });
  });
});

// MYK9-747: the clubs replica is shared across sign-in states on one device,
// so a signed-out club page reads the server only.
describe('ClubDetailPage signed-out viewer (MYK9-747)', () => {
  beforeEach(() => {
    auth.value = { user: null, userWithRoles: null, loading: false };
  });

  it('renders not-found for a revoked club cached in the replica, without reading the replica', async () => {
    state.clubs = [{ ...club, id: 'club-revoked', name: 'Revoked Club', authorizedAt: null }];
    state.clubReadiness = 'fresh';
    // clubs_select hides the revoked club from anon: no row.
    getPublicClubById.mockResolvedValue(null);

    renderPage('/clubs/club-revoked');

    expect(await screen.findByRole('heading', { name: 'Club not found' })).toBeInTheDocument();
    expect(screen.queryByTestId('club-details')).not.toBeInTheDocument();
    expect(getPublicClubById).toHaveBeenCalledWith('club-revoked');
    expect(state.replicaReads).toBe(0);
    expect(state.ensureClubsReady).not.toHaveBeenCalled();
  });

  it("renders the server's club row", async () => {
    getPublicClubById.mockResolvedValue({ ...club, name: 'Server Heartland' });

    renderPage('/clubs/club-1');

    expect(await screen.findByTestId('club-details')).toHaveTextContent('Server Heartland');
    expect(state.replicaReads).toBe(0);
  });

  it('renders the offline state, not not-found, with no connection', () => {
    onlineManager.setOnline(false);
    state.clubs = [club];

    renderPage('/clubs/club-1');

    expect(screen.getByText("You're offline")).toBeInTheDocument();
    expect(screen.getByText('Connect to the internet to see this club.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Club not found' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('club-details')).not.toBeInTheDocument();
    expect(getPublicClubById).not.toHaveBeenCalled();
    expect(state.replicaReads).toBe(0);
  });

  it('renders loading, not not-found, while the read is pending', () => {
    getPublicClubById.mockReturnValue(new Promise(() => {}));

    renderPage('/clubs/club-1');

    expect(screen.getByTestId('detail-skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Club not found' })).not.toBeInTheDocument();
  });

  it('renders the unavailable state, not not-found, when the read fails, and retries the server', async () => {
    getPublicClubById.mockRejectedValueOnce(new Error('network')).mockResolvedValue(club);

    const { user } = renderPage('/clubs/club-1');

    expect(
      await screen.findByRole('heading', { name: 'Club details are unavailable' })
    ).toBeInTheDocument();
    expect(screen.queryByText(/saved club information/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('club-details')).toHaveTextContent('Heartland Club');
    expect(state.ensureClubsReady).not.toHaveBeenCalled();
  });
});
