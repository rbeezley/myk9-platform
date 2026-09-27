import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { act, screen } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import type { Club } from '@/types/club-types';
import type { Show } from '@/types/show-types';
import ClubDetailPage from '../ClubDetailPage';

// MYK9-768: /clubs/:id listed the club's shows from the device-wide shows
// replica for everyone. A guest on a device a secretary used earlier saw
// shows anon RLS (shows_select) never returns: drafts, and shows
// soft-deleted after they were cached. These tests render the real page and
// the real ClubDetails over a replica holding exactly those rows.

const auth = vi.hoisted(() => ({
  value: {
    user: null,
    userWithRoles: null,
    loading: false,
  } as {
    user: { id: string; is_anonymous?: boolean } | null;
    userWithRoles: { roles: string[]; scopes?: unknown[] } | null;
    loading: boolean;
  },
}));

const clubReplica = vi.hoisted(() => ({ clubs: [] as Club[] }));

const replica = vi.hoisted(() => ({
  shows: [] as Show[],
  // Counts every read of the shows replica's list, so a test can prove a
  // signed-out viewer never consults it.
  reads: 0,
}));

const getPublicClubById = vi.hoisted(() => vi.fn());
const getPublicClubShows = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => auth.value,
}));

vi.mock('@/store/clubStore', () => {
  const value = {
    get clubs() {
      return clubReplica.clubs;
    },
    clubReadiness: 'fresh',
    ensureClubsReady: () => Promise.resolve({ status: 'fresh', clubs: [] }),
    updateClub: vi.fn(),
  };
  return {
    useClubStore: (selector?: (v: typeof value) => unknown) => (selector ? selector(value) : value),
  };
});

vi.mock('@/store/showStore', () => {
  const store = {
    get shows() {
      replica.reads += 1;
      return replica.shows;
    },
  };
  return {
    useShowStore: (selector?: (v: typeof store) => unknown) => (selector ? selector(store) : store),
  };
});

vi.mock('@/services/database/clubs', () => ({ getPublicClubById }));

vi.mock('@/services/database/shows/publicClubShows', () => ({ getPublicClubShows }));

vi.mock('@/services/database/club-memberships/members', () => ({
  getClubMembers: () => Promise.resolve([]),
  getActiveClubMembers: () => [],
}));

vi.mock('@/hooks/queries/useClubsDatabase', () => ({
  useDeleteClubMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
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

function replicaShow(overrides: Partial<Show> & Pick<Show, 'id' | 'name' | 'status'>): Show {
  return {
    organization: 'AKC',
    startDate: '2099-05-01',
    endDate: '2099-05-02',
    location: 'Tulsa, OK',
    events: ['Scent Work'],
    clubId: 'club-1',
    accentColor: '',
    ...overrides,
  } as Show;
}

// What a secretary's earlier session left in the device-wide replica.
const PUBLISHED = replicaShow({ id: 'show-pub', name: 'Spring Scent Trial', status: 'published' });
const DRAFT = replicaShow({ id: 'show-draft', name: 'Secret Draft Trial', status: 'draft' });
// Soft-deleted on the server after this device cached it: the replica never
// learns (incremental sync reads deleted_at IS NULL only), and the store's
// Show carries no deletedAt, so it still looks published locally.
const DELETED = replicaShow({ id: 'show-del', name: 'Cancelled Trial', status: 'published' });

const serverPublished = {
  id: 'show-pub',
  name: 'Spring Scent Trial',
  startDate: '2099-05-01',
  endDate: '2099-05-02',
  location: 'Tulsa, OK',
  events: ['Scent Work'],
  accentColor: null,
};

function renderPage() {
  return render(
    <Routes>
      <Route path="/clubs/:id" element={<ClubDetailPage />} />
    </Routes>,
    { initialRoute: '/clubs/club-1' }
  );
}

beforeEach(() => {
  auth.value = { user: null, userWithRoles: null, loading: false };
  replica.shows = [PUBLISHED, DRAFT, DELETED];
  replica.reads = 0;
  clubReplica.clubs = [];
  getPublicClubById.mockReset();
  getPublicClubById.mockResolvedValue(club);
  getPublicClubShows.mockReset();
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('ClubDetailPage show list for a signed-out guest (MYK9-768)', () => {
  it("lists only the server's shows, never a cached draft or soft-deleted show", async () => {
    getPublicClubShows.mockResolvedValue([serverPublished]);

    renderPage();

    expect(await screen.findByText('Spring Scent Trial')).toBeInTheDocument();
    expect(screen.queryByText('Secret Draft Trial')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancelled Trial')).not.toBeInTheDocument();
    expect(getPublicClubShows).toHaveBeenCalledWith('club-1');
    expect(replica.reads).toBe(0);
    // Counts agree with the list: one upcoming show, not three.
    expect(screen.getByText('Upcoming: 1 \u00B7 Completed: 0')).toBeInTheDocument();
  });

  it('a failed server read says so instead of "No Upcoming Shows"', async () => {
    getPublicClubShows.mockRejectedValue(new Error('network'));

    renderPage();

    expect(await screen.findByText("We couldn't load this club's shows")).toBeInTheDocument();
    expect(screen.queryByText('No Upcoming Shows')).not.toBeInTheDocument();
    expect(screen.getByText('Shows unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/No shows scheduled/)).not.toBeInTheDocument();
    expect(screen.queryByText('Secret Draft Trial')).not.toBeInTheDocument();
    expect(screen.queryByText('Spring Scent Trial')).not.toBeInTheDocument();
  });

  it('Try again after a failed read lists what the server returns', async () => {
    getPublicClubShows.mockRejectedValueOnce(new Error('network'));
    getPublicClubShows.mockResolvedValue([serverPublished]);

    const { user } = renderPage();

    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Spring Scent Trial')).toBeInTheDocument();
    expect(screen.queryByText('Secret Draft Trial')).not.toBeInTheDocument();
  });

  it('while the read is in flight, shows neither an empty list nor cached shows', async () => {
    getPublicClubShows.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(await screen.findByText("Loading this club's shows…")).toBeInTheDocument();
    expect(screen.queryByText('No Upcoming Shows')).not.toBeInTheDocument();
    expect(screen.getByText('Loading shows…')).toBeInTheDocument();
    expect(screen.queryByText(/No shows scheduled/)).not.toBeInTheDocument();
    expect(screen.queryByText('Spring Scent Trial')).not.toBeInTheDocument();
  });

  it('offline, says the shows need a connection instead of listing cached ones', async () => {
    getPublicClubShows.mockResolvedValue([serverPublished]);

    renderPage();
    expect(await screen.findByText('Spring Scent Trial')).toBeInTheDocument();

    act(() => {
      onlineManager.setOnline(false);
    });

    expect(await screen.findByText("You're offline")).toBeInTheDocument();
    expect(screen.queryByText('Spring Scent Trial')).not.toBeInTheDocument();
    expect(screen.queryByText('No Upcoming Shows')).not.toBeInTheDocument();
  });
});

describe('ClubDetailPage show list for a signed-in viewer (MYK9-768)', () => {
  it('keeps reading the shows replica and never calls the guest read', async () => {
    auth.value = {
      user: { id: 'user-1', is_anonymous: false },
      userWithRoles: { roles: ['secretary'], scopes: [] },
      loading: false,
    };
    clubReplica.clubs = [club];
    replica.shows = [PUBLISHED, DRAFT];

    renderPage();

    // Unchanged: a signed-in viewer's list comes from the replica, which is
    // scoped by that viewer's own RLS at sync time.
    expect(await screen.findByText('Spring Scent Trial')).toBeInTheDocument();
    expect(screen.getByText('Secret Draft Trial')).toBeInTheDocument();
    expect(replica.reads).toBeGreaterThan(0);
    expect(getPublicClubShows).not.toHaveBeenCalled();
  });
});
