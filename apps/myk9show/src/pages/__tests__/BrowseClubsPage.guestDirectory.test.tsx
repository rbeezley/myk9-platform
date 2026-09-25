/**
 * MYK9-747: the signed-out club directory is online-only. These tests render
 * the real page over the real useBrowseClubsData, with the clubs replica
 * holding rows a guest must never see, and the server read mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { render } from '@/test/utils/testUtils';
import type { Club } from '@/types/club-types';

const replica = vi.hoisted(() => ({
  clubs: [] as Club[],
  ensureClubsReady: vi.fn(),
}));
const getPublicDirectoryClubs = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({
  value: { user: null, userWithRoles: null, loading: false } as {
    user: { id: string; is_anonymous?: boolean } | null;
    userWithRoles: { roles: string[] } | null;
    loading: boolean;
  },
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => auth.value,
}));

vi.mock('@/store/clubStore', () => ({
  useClubStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      clubs: replica.clubs,
      clubReadiness: 'fresh',
      ensureClubsReady: replica.ensureClubsReady,
      addClub: vi.fn(),
      selectClub: vi.fn(),
    }),
}));

vi.mock('@/store/showStore', () => ({
  useShowStore: (selector: (s: Record<string, unknown>) => unknown) => selector({ shows: [] }),
}));

vi.mock('@/services/database/clubs', () => ({
  getPublicDirectoryClubs,
}));

vi.mock('@/components/clubs/browse', () => {
  const View = ({ clubs }: { clubs: Club[] }) => (
    <ul data-testid="clubs-view">
      {clubs.map(c => (
        <li key={c.id}>{c.name}</li>
      ))}
    </ul>
  );
  return { ClubsGridView: View, ClubsListView: View };
});

vi.mock('@/components/common/SkeletonLoaders', () => ({
  BrowseClubsSkeleton: () => <div data-testid="clubs-skeleton">Loading...</div>,
}));

import BrowseClubsPage from '../BrowseClubsPage';

function makeClub(id: string, name: string, overrides: Partial<Club> = {}): Club {
  return {
    id,
    name,
    clubNumber: '',
    email: '',
    phone: '',
    description: '',
    address: { street: '', city: 'Tulsa', state: 'OK', zipCode: '', country: 'US' },
    logo: '',
    coverImage: '',
    accentColor: '',
    upcomingShows: [],
    pastShows: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  auth.value = { user: null, userWithRoles: null, loading: false };
  // What a secretary's earlier signed-in session left in the device-wide
  // replica: a revoked club and their own never-authorized club.
  replica.clubs = [
    makeClub('club-revoked', 'Revoked Kennel Club', { authorizedAt: null }),
    makeClub('club-unauthorized', 'Unauthorized Secretary Club', { authorizedAt: null }),
  ];
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('BrowseClubsPage signed-out directory (MYK9-747)', () => {
  it("shows the server's clubs and none of the replica's cached rows", async () => {
    getPublicDirectoryClubs.mockResolvedValue([makeClub('club-public', 'Public Obedience Club')]);

    render(<BrowseClubsPage />, { initialRoute: '/clubs' });

    expect(await screen.findByText('Public Obedience Club')).toBeInTheDocument();
    expect(screen.queryByText('Revoked Kennel Club')).not.toBeInTheDocument();
    expect(screen.queryByText('Unauthorized Secretary Club')).not.toBeInTheDocument();
    expect(replica.ensureClubsReady).not.toHaveBeenCalled();
  });

  it('shows an offline state, not an empty directory, with no connection', () => {
    onlineManager.setOnline(false);
    getPublicDirectoryClubs.mockResolvedValue([]);

    render(<BrowseClubsPage />, { initialRoute: '/clubs' });

    expect(screen.getByText("You're offline")).toBeInTheDocument();
    expect(screen.getByText('Connect to the internet to browse clubs.')).toBeInTheDocument();
    expect(screen.queryByText('No clubs yet')).not.toBeInTheDocument();
    expect(screen.queryByText('Revoked Kennel Club')).not.toBeInTheDocument();
    expect(getPublicDirectoryClubs).not.toHaveBeenCalled();
  });

  it('shows a loading state, not an empty directory, while the read is pending', () => {
    getPublicDirectoryClubs.mockReturnValue(new Promise(() => {}));

    render(<BrowseClubsPage />, { initialRoute: '/clubs' });

    expect(screen.getByTestId('clubs-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('No clubs yet')).not.toBeInTheDocument();
  });

  it('shows an error state, not an empty directory, when the read fails', async () => {
    getPublicDirectoryClubs.mockRejectedValue(new Error('network'));

    render(<BrowseClubsPage />, { initialRoute: '/clubs' });

    expect(await screen.findByText("We couldn't load your clubs.")).toBeInTheDocument();
    expect(screen.queryByText('No clubs yet')).not.toBeInTheDocument();
  });

  it('keeps the replica path for a signed-in viewer', async () => {
    auth.value = {
      user: { id: 'user-1', is_anonymous: false },
      userWithRoles: { roles: ['secretary'] },
      loading: false,
    };

    render(<BrowseClubsPage />, { initialRoute: '/clubs' });

    expect(await screen.findByText('Unauthorized Secretary Club')).toBeInTheDocument();
    expect(getPublicDirectoryClubs).not.toHaveBeenCalled();
    expect(replica.ensureClubsReady).toHaveBeenCalled();
  });
});
