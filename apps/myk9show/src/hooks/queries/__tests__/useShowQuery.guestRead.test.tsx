import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useShowQuery } from '../useShowsDatabase';

// MYK9-783: useShowQuery read the replica-first getShowById for everyone. The
// sign-in page ("Sign in to enter <show>") and the public class results page
// reach it signed out, so a guest on a device a secretary used earlier got the
// secretary's draft, or a show soft-deleted on the server since it was cached.

const auth = vi.hoisted(() => ({
  value: { user: null, loading: false } as {
    user: { id: string; is_anonymous?: boolean } | null;
    loading: boolean;
  },
}));
const getShowById = vi.hoisted(() => vi.fn());
const getPublicShowById = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => auth.value }));
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

// What the device replica holds after a secretary's session: a draft, and a
// show soft-deleted on the server since this device cached it.
const REPLICA: Record<string, ReturnType<typeof dbRow>> = {
  [DRAFT_ID]: dbRow(DRAFT_ID, 'Secret Draft Trial', 'draft'),
  [DELETED_ID]: dbRow(DELETED_ID, 'Cancelled Trial', 'published'),
  [PUBLISHED_ID]: dbRow(PUBLISHED_ID, 'Spring Scent Trial', 'published'),
};

let queryClient: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const renderShow = (id: string) => renderHook(() => useShowQuery(id), { wrapper });

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  auth.value = { user: null, loading: false };
  getShowById.mockReset();
  getShowById.mockImplementation(async (id: string) => ({ data: REPLICA[id], error: null }));
  getPublicShowById.mockReset();
  // anon's shows_select: only the published, not-deleted show.
  getPublicShowById.mockImplementation(async (id: string) =>
    id === PUBLISHED_ID ? REPLICA[PUBLISHED_ID] : null
  );
});

afterEach(() => {
  onlineManager.setOnline(true);
  queryClient.clear();
});

describe('useShowQuery for a signed-out guest (MYK9-783)', () => {
  it.each([
    ['a draft', DRAFT_ID],
    ['a show deleted on the server', DELETED_ID],
  ])('has no show for %s, and never reads the replica', async (_label, id) => {
    const { result } = renderShow(id);

    await waitFor(() => expect(getPublicShowById).toHaveBeenCalledWith(id));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeUndefined();
    expect(result.current.isError).toBe(false);
    expect(getShowById).not.toHaveBeenCalled();
  });

  it('gets the published show from the server read', async () => {
    const { result } = renderShow(PUBLISHED_ID);

    await waitFor(() => expect(result.current.data?.name).toBe('Spring Scent Trial'));
    expect(getShowById).not.toHaveBeenCalled();
  });

  it('offline, has no show at all rather than a cached copy', async () => {
    queryClient.setQueryData(['shows', 'detail', DRAFT_ID], { name: 'Secret Draft Trial' });
    onlineManager.setOnline(false);
    const { result } = renderShow(DRAFT_ID);

    expect(result.current.data).toBeUndefined();
    expect(getShowById).not.toHaveBeenCalled();
  });

  it('reads nothing while the session is still resolving', () => {
    auth.value = { user: null, loading: true };
    const { result } = renderShow(DRAFT_ID);

    expect(result.current.data).toBeUndefined();
    expect(getShowById).not.toHaveBeenCalled();
    expect(getPublicShowById).not.toHaveBeenCalled();
  });
});

describe('useShowQuery for a signed-in account (unchanged)', () => {
  it('a signed-in member reads the replica-backed show', async () => {
    auth.value = { user: { id: 'user-1' }, loading: false };
    const { result } = renderShow(DRAFT_ID);

    await waitFor(() => expect(result.current.data?.name).toBe('Secret Draft Trial'));
    expect(getPublicShowById).not.toHaveBeenCalled();
  });
});

// Owner decision: on a public page a ringside passcode session reads like a
// signed-out guest. It used to keep the replica path, so on a shared device it
// saw a previous secretary's draft. No /at-show page calls useShowQuery.
describe('useShowQuery for a ringside passcode session', () => {
  beforeEach(() => {
    auth.value = { user: { id: 'anon-1', is_anonymous: true }, loading: false };
  });

  it.each([
    ['a draft', DRAFT_ID],
    ['a show deleted on the server', DELETED_ID],
  ])('has no show for %s, and never reads the replica', async (_label, id) => {
    const { result } = renderShow(id);

    await waitFor(() => expect(getPublicShowById).toHaveBeenCalledWith(id));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeUndefined();
    expect(getShowById).not.toHaveBeenCalled();
  });

  it('gets the published show from the server read', async () => {
    const { result } = renderShow(PUBLISHED_ID);

    await waitFor(() => expect(result.current.data?.name).toBe('Spring Scent Trial'));
    expect(getShowById).not.toHaveBeenCalled();
  });
});
