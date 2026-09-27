import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Show } from '@/types/show-types';
import { useFastShowDetails } from '../useFastShowDetails';

// MYK9-779: /shows/:id read the device-wide shows replica first for everyone.
// getShowById returned the replica row even when the server returns nothing
// to anon, and the store stood in as placeholderData while the read ran. A
// guest on a device a secretary used earlier saw that secretary's drafts, and
// shows soft-deleted on the server after this device cached them.

const auth = vi.hoisted(() => ({
  value: { user: null, loading: false } as {
    user: { id: string; is_anonymous?: boolean } | null;
    loading: boolean;
  },
}));

const replica = vi.hoisted(() => ({ shows: [] as Show[], reads: 0 }));
const getShowById = vi.hoisted(() => vi.fn());
const getPublicShowById = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => auth.value }));

vi.mock('@/store/showStore', () => {
  const store = {
    get shows() {
      replica.reads += 1;
      return replica.shows;
    },
  };
  return {
    useShowStore: (selector?: (s: typeof store) => unknown) => (selector ? selector(store) : store),
  };
});

vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  showQueryKeys: {
    detail: (id: string) => ['shows', 'detail', id],
    lists: () => ['shows', 'list'],
  },
}));

// getShowById is replica-first: it answers from this device's copy.
vi.mock('@/services/database/shows', () => ({ getShowById }));
vi.mock('@/services/database/shows/publicShowDetail', () => ({ getPublicShowById }));

const DRAFT_ID = '11111111-1111-4111-8111-111111111111';
const DELETED_ID = '22222222-2222-4222-8222-222222222222';
const PUBLISHED_ID = '33333333-3333-4333-8333-333333333333';

function dbRow(id: string, name: string, status: string) {
  return {
    id,
    name,
    status,
    organization: 'AKC',
    start_date: '2099-05-01',
    end_date: '2099-05-02',
    location: 'Tulsa, OK',
    club_id: 'club-1',
    trials: [],
  };
}

function storeShow(id: string, name: string, status: string): Show {
  return {
    id,
    name,
    status,
    organization: 'AKC',
    startDate: '2099-05-01',
    endDate: '2099-05-02',
    location: 'Tulsa, OK',
    events: [],
    clubId: 'club-1',
  } as unknown as Show;
}

let queryClient: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

const renderDetail = (id: string) => renderHook(() => useFastShowDetails(id), { wrapper });

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  auth.value = { user: null, loading: false };
  // What a secretary's earlier session left on this device: a draft, and a
  // show soft-deleted on the server since (the store's Show has no
  // deletedAt, so it still reads as published).
  replica.shows = [
    storeShow(DRAFT_ID, 'Secret Draft Trial', 'draft'),
    storeShow(DELETED_ID, 'Cancelled Trial', 'published'),
  ];
  replica.reads = 0;
  getShowById.mockReset();
  getShowById.mockImplementation(async (id: string) => ({
    data:
      id === DRAFT_ID
        ? dbRow(DRAFT_ID, 'Secret Draft Trial', 'draft')
        : dbRow(DELETED_ID, 'Cancelled Trial', 'published'),
    error: null,
  }));
  getPublicShowById.mockReset();
});

afterEach(() => {
  onlineManager.setOnline(true);
  queryClient.clear();
});

describe('useFastShowDetails for a signed-out guest (MYK9-779)', () => {
  it.each([
    ['a draft', DRAFT_ID],
    ['a show deleted on the server since it was cached', DELETED_ID],
  ])('%s the server does not return is not found, never the replica row', async (_label, id) => {
    getPublicShowById.mockResolvedValue(null);

    const { result } = renderDetail(id);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.show).toBeNull();
    expect(result.current.isError).toBe(false);
    expect(result.current.hasData).toBe(false);
    expect(getPublicShowById).toHaveBeenCalledWith(id);
    expect(getShowById).not.toHaveBeenCalled();
    expect(replica.reads).toBe(0);
  });

  it('while the server read is in flight, renders no cached row', async () => {
    getPublicShowById.mockReturnValue(new Promise(() => {}));

    const { result } = renderDetail(DRAFT_ID);

    await waitFor(() => expect(getPublicShowById).toHaveBeenCalled());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.show).toBeNull();
    expect(result.current.isFromCache).toBe(false);
  });

  it('a failed server read is an error with no cached row behind it', async () => {
    getPublicShowById.mockRejectedValue(new Error('network'));

    const { result } = renderDetail(DELETED_ID);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.show).toBeNull();
    expect(result.current.refreshFailed).toBe(false);
    expect(replica.reads).toBe(0);
  });

  it('offline, is offline with no cached row', async () => {
    onlineManager.setOnline(false);
    getPublicShowById.mockResolvedValue(dbRow(PUBLISHED_ID, 'Spring Scent Trial', 'published'));

    const { result } = renderDetail(DELETED_ID);

    await waitFor(() => expect(result.current.isOffline).toBe(true));
    expect(result.current.show).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(getShowById).not.toHaveBeenCalled();
  });

  it('a published show the server returns renders', async () => {
    getPublicShowById.mockResolvedValue(dbRow(PUBLISHED_ID, 'Spring Scent Trial', 'published'));

    const { result } = renderDetail(PUBLISHED_ID);

    await waitFor(() => expect(result.current.show?.name).toBe('Spring Scent Trial'));
    expect(result.current.isError).toBe(false);
  });
});

describe('useFastShowDetails for a signed-in secretary (MYK9-779)', () => {
  it('keeps the replica-first read and the store placeholder', async () => {
    auth.value = { user: { id: 'user-1', is_anonymous: false }, loading: false };
    getShowById.mockReturnValue(new Promise(() => {}));

    const { result } = renderDetail(DRAFT_ID);

    // The store row stands in while the replica-first read runs, as before.
    await waitFor(() => expect(result.current.show?.name).toBe('Secret Draft Trial'));
    expect(result.current.isFromCache).toBe(true);
    expect(getShowById).toHaveBeenCalledWith(DRAFT_ID);
    expect(getPublicShowById).not.toHaveBeenCalled();
  });

  it("resolves the secretary's draft from the replica-first read", async () => {
    auth.value = { user: { id: 'user-1', is_anonymous: false }, loading: false };
    replica.shows = [];

    const { result } = renderDetail(DRAFT_ID);

    await waitFor(() => expect(result.current.show?.name).toBe('Secret Draft Trial'));
    expect(result.current.isFromCache).toBe(false);
    expect(getPublicShowById).not.toHaveBeenCalled();
  });
});

// Owner decision: on /shows/:id a ringside passcode session reads the server
// like a signed-out guest. On a shared device the replica still holds a
// previous secretary's drafts and shows deleted since.
describe('useFastShowDetails for a ringside passcode session', () => {
  beforeEach(() => {
    auth.value = { user: { id: 'anon-1', is_anonymous: true }, loading: false };
  });

  it.each([
    ['a draft', DRAFT_ID],
    ['a show deleted on the server since it was cached', DELETED_ID],
  ])('%s the server does not return is not found, never the replica row', async (_label, id) => {
    getPublicShowById.mockResolvedValue(null);

    const { result } = renderDetail(id);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.show).toBeNull();
    expect(result.current.isFromCache).toBe(false);
    expect(getPublicShowById).toHaveBeenCalledWith(id);
    expect(getShowById).not.toHaveBeenCalled();
    expect(replica.reads).toBe(0);
  });

  it('offline, is offline with no cached row', async () => {
    onlineManager.setOnline(false);

    const { result } = renderDetail(DRAFT_ID);

    await waitFor(() => expect(result.current.isOffline).toBe(true));
    expect(result.current.show).toBeNull();
    expect(getShowById).not.toHaveBeenCalled();
    expect(replica.reads).toBe(0);
  });
});
