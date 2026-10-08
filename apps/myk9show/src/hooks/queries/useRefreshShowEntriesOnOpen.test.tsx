import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  sync: vi.fn(),
  hasSynced: vi.fn(),
  getEntriesForShow: vi.fn(),
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { sync: mocks.sync },
}));
vi.mock('@/services/replication/entriesShowSyncState', () => ({
  hasShowEntriesSynced: mocks.hasSynced,
}));
vi.mock('@/services/database/entries', () => ({
  getEntriesByShow: vi.fn(),
  getPublicEntriesByShow: vi.fn(),
  getEntriesByDog: vi.fn(),
  getEntriesByStatus: vi.fn(),
  getEntriesForShow: mocks.getEntriesForShow,
  searchEntries: vi.fn(),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'u1' }, loading: false }),
}));

import { useSecretaryShowEntriesQuery } from './useEntriesDatabase';
import { resetShowOpenRefreshesForTests } from '@/services/database/entries/refreshShowEntriesForRead';

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

function setup(showId = 'show-1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const render = (id = showId) =>
    renderHook(({ id: current }) => useSecretaryShowEntriesQuery(current), {
      wrapper,
      initialProps: { id },
    });
  return { client, invalidate, render };
}

const row = (id: string) => ({ id });

describe('useRefreshShowEntriesOnOpen via the staff entries query (MYK9-1064)', () => {
  beforeEach(() => {
    mocks.sync.mockReset().mockResolvedValue({ success: true });
    mocks.hasSynced.mockReset().mockResolvedValue(true);
    mocks.getEntriesForShow.mockReset().mockResolvedValue({ data: [row('e1')], error: null });
    resetShowOpenRefreshesForTests();
    onlineManager.setOnline(true);
    setVisibility('visible');
  });

  afterEach(() => {
    onlineManager.setOnline(true);
    setVisibility('visible');
  });

  it('warm open: one sync, then one invalidation that re-runs the read', async () => {
    const { invalidate, render } = setup();
    render();

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    expect(mocks.sync).toHaveBeenCalledTimes(1);
    expect(mocks.sync).toHaveBeenCalledWith('show-1');
    await waitFor(() => expect(mocks.getEntriesForShow).toHaveBeenCalledTimes(2));
    expect(mocks.sync).toHaveBeenCalledTimes(1);
  });

  it('cold open: the hook syncs nothing', async () => {
    mocks.hasSynced.mockResolvedValue(false);
    const { invalidate, render } = setup();
    const view = render();

    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('a refresh that removes the last entry refetches to an empty list, not stale rows', async () => {
    mocks.getEntriesForShow
      .mockResolvedValueOnce({ data: [row('e1')], error: null })
      .mockResolvedValue({ data: [], error: null });
    const { render } = setup();
    const view = render();

    await waitFor(() => expect(view.result.current.data).toEqual([]));
  });

  it('a failed refresh invalidates nothing and the next open retries', async () => {
    mocks.sync.mockResolvedValueOnce({ success: false });
    const { invalidate, render } = setup();
    const first = render();
    await waitFor(() => expect(mocks.sync).toHaveBeenCalledTimes(1));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(invalidate).not.toHaveBeenCalled();
    first.unmount();

    render();
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    expect(mocks.sync).toHaveBeenCalledTimes(2);
  });

  it('a second open inside 15 s shares the refresh and the invalidation', async () => {
    const { invalidate, render } = setup();
    const first = render();
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    first.unmount();
    render();
    await new Promise(resolve => setTimeout(resolve, 30));

    expect(mocks.sync).toHaveBeenCalledTimes(1);
  });

  it('concurrent mounts share one sync and one invalidation', async () => {
    const { invalidate, render } = setup();
    render();
    render();

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(mocks.sync).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('offline: no sync', async () => {
    onlineManager.setOnline(false);
    const { render } = setup();
    render();
    await new Promise(resolve => setTimeout(resolve, 30));

    expect(mocks.sync).not.toHaveBeenCalled();
  });
});
