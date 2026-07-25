import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Club } from '@/types/club-types';
import ClubDetailPage from '../ClubDetailPage';

const state = vi.hoisted(() => ({
  clubs: [] as Club[],
  clubReadiness: 'loading' as 'loading' | 'fresh' | 'offline' | 'unavailable',
  ensureClubsReady: vi.fn(() => Promise.resolve({ status: 'fresh', clubs: [] })),
}));

vi.mock('@/store/clubStore', () => ({
  useClubStore: (selector: (value: typeof state) => unknown) => selector(state),
}));

vi.mock('@/components/clubs/ClubDetails', () => ({
  ClubDetails: ({ selectedClub }: { selectedClub: Club | null }) => (
    <div data-testid="club-details">{selectedClub?.name ?? 'no club'}</div>
  ),
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
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/clubs/:id" element={<ClubDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ClubDetailPage readiness outcomes', () => {
  beforeEach(() => {
    state.clubs = [];
    state.clubReadiness = 'loading';
    state.ensureClubsReady.mockClear();
  });

  it('keeps a valid guest detail URL and passes its requested ID to readiness', () => {
    state.clubs = [club];
    state.clubReadiness = 'fresh';

    renderPage('/clubs/club-1');

    expect(screen.getByTestId('club-details')).toHaveTextContent('Heartland Club');
    expect(state.ensureClubsReady).toHaveBeenCalledWith({ requestedClubId: 'club-1' });
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
    const user = userEvent.setup();

    renderPage('/clubs/missing-club');

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
