import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient, renderHook, waitFor } from '@/test/utils/testUtils';
import { useLocalEntryForShowToday } from './useLocalEntryForShowToday';

// A faithful fake of ReplicatedTable.subscribe: listeners are held per table,
// `emitCurrent: false` emits nothing, `notify` is what a replica write triggers.
const tables = vi.hoisted(() => {
  const listeners = new Map<string, Set<() => void>>();
  const subscribeFor = (name: string) => (cb: () => void) => {
    const set = listeners.get(name) ?? new Set<() => void>();
    listeners.set(name, set);
    set.add(cb);
    return () => set.delete(cb);
  };
  return {
    getShowById: vi.fn(),
    getTrialsByShow: vi.fn(),
    getEntriesByShow: vi.fn(),
    getAllDogs: vi.fn(),
    listeners,
    subscribeFor,
    notify: (name: string) => listeners.get(name)?.forEach(cb => cb()),
  };
});

vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: {
    subscribe: tables.subscribeFor('shows'),
    getShowById: tables.getShowById,
  },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: {
    subscribe: tables.subscribeFor('trials'),
    getTrialsByShow: tables.getTrialsByShow,
  },
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    subscribe: tables.subscribeFor('entries'),
    getEntriesByShow: tables.getEntriesByShow,
  },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { subscribe: tables.subscribeFor('dogs'), getAllDogs: tables.getAllDogs },
}));

const TODAY = new Date(Date.UTC(2026, 9, 23, 12, 0, 0));
const LIVE_SHOW = { id: 'show-1', startDate: '2026-10-22', endDate: '2026-10-24', deletedAt: null };

function renderLocalEntry(personId: string | null, showId: string | undefined = 'show-1') {
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useLocalEntryForShowToday(personId, showId), { wrapper });
}

describe('useLocalEntryForShowToday', () => {
  beforeEach(() => {
    tables.listeners.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(TODAY);
    tables.getShowById.mockReset().mockResolvedValue(LIVE_SHOW);
    tables.getTrialsByShow.mockReset().mockResolvedValue([]);
    tables.getEntriesByShow
      .mockReset()
      .mockResolvedValue([{ id: 'entry-1', showId: 'show-1', handlerId: 'person-1' }]);
    tables.getAllDogs.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('answers true for a handler entry on a show that is on today', async () => {
    const { result } = renderLocalEntry('person-1');

    await waitFor(() => expect(result.current.hasLocalEntryToday).toBe(true));
    expect(result.current.isLoading).toBe(false);
    expect(tables.getShowById).toHaveBeenCalledWith('show-1');
    expect(tables.getEntriesByShow).toHaveBeenCalledWith('show-1');
  });

  it('uses the show-local calendar date from the replicated trial, not the UTC date', async () => {
    // Nov 8 18:00 Pacific is Nov 9 02:00 UTC: the last show day in the show's
    // zone, already past it in UTC.
    vi.setSystemTime(new Date('2026-11-09T02:00:00Z'));
    tables.getShowById.mockResolvedValue({
      ...LIVE_SHOW,
      startDate: '2026-11-07',
      endDate: '2026-11-08',
    });
    tables.getTrialsByShow.mockResolvedValue([
      { id: 'trial-1', date: '2026-11-07', timezone: 'America/Los_Angeles' },
    ]);

    const { result } = renderLocalEntry('person-1');

    await waitFor(() => expect(result.current.hasLocalEntryToday).toBe(true));
    expect(tables.getTrialsByShow).toHaveBeenCalledWith('show-1');
  });

  it('is false the evening before day 1 in the show zone', async () => {
    vi.setSystemTime(new Date('2026-11-07T01:30:00Z'));
    tables.getShowById.mockResolvedValue({
      ...LIVE_SHOW,
      startDate: '2026-11-07',
      endDate: '2026-11-08',
    });
    tables.getTrialsByShow.mockResolvedValue([
      { id: 'trial-1', date: '2026-11-07', timezone: 'America/Los_Angeles' },
    ]);

    const { result } = renderLocalEntry('person-1');

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(tables.getTrialsByShow).toHaveBeenCalled();
    expect(result.current.hasLocalEntryToday).toBe(false);
  });

  it('answers false for an empty replica', async () => {
    tables.getShowById.mockResolvedValue(null);
    tables.getEntriesByShow.mockResolvedValue([]);

    const { result } = renderLocalEntry('person-1');

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(tables.getEntriesByShow).toHaveBeenCalled();
    expect(result.current.hasLocalEntryToday).toBe(false);
  });

  it('answers false, without throwing, when a table read rejects', async () => {
    tables.getEntriesByShow.mockRejectedValue(new Error('IndexedDB unavailable'));

    const { result } = renderLocalEntry('person-1');

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(tables.getEntriesByShow).toHaveBeenCalled();
    expect(result.current.hasLocalEntryToday).toBe(false);
  });

  it('is disabled and reads nothing without a person id', () => {
    const { result } = renderLocalEntry(null);

    expect(result.current).toEqual({ hasLocalEntryToday: false, isLoading: false });
    expect(tables.getShowById).not.toHaveBeenCalled();
    expect(tables.getEntriesByShow).not.toHaveBeenCalled();
    expect(tables.getAllDogs).not.toHaveBeenCalled();
  });

  it('flips false to true when a direct sync fills the entries replica, without a remount', async () => {
    tables.getShowById.mockResolvedValue(null);
    tables.getEntriesByShow.mockResolvedValue([]);
    const { result } = renderLocalEntry('person-1');
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasLocalEntryToday).toBe(false);

    tables.getShowById.mockResolvedValue(LIVE_SHOW);
    tables.getEntriesByShow.mockResolvedValue([
      { id: 'entry-1', showId: 'show-1', handlerId: 'person-1' },
    ]);
    tables.notify('entries');

    await waitFor(() => expect(result.current.hasLocalEntryToday).toBe(true));
  });

  it('flips to true when the shows replica fills after the entries did', async () => {
    tables.getShowById.mockResolvedValue(null);
    const { result } = renderLocalEntry('person-1');
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasLocalEntryToday).toBe(false);

    tables.getShowById.mockResolvedValue(LIVE_SHOW);
    tables.notify('shows');

    await waitFor(() => expect(result.current.hasLocalEntryToday).toBe(true));
  });

  it('re-evaluates to false when the entry is withdrawn locally', async () => {
    const { result } = renderLocalEntry('person-1');
    await waitFor(() => expect(result.current.hasLocalEntryToday).toBe(true));

    tables.getEntriesByShow.mockResolvedValue([
      { id: 'entry-1', showId: 'show-1', handlerId: 'person-1', entryStatus: 'withdrawn' },
    ]);
    tables.notify('entries');

    await waitFor(() => expect(result.current.hasLocalEntryToday).toBe(false));
  });

  it('re-evaluates when the dogs replica changes ownership', async () => {
    tables.getEntriesByShow.mockResolvedValue([
      { id: 'entry-1', showId: 'show-1', handlerId: 'someone-else', dogId: 'dog-1' },
    ]);
    const { result } = renderLocalEntry('person-1');
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasLocalEntryToday).toBe(false);

    tables.getAllDogs.mockResolvedValue([{ id: 'dog-1', ownerId: 'person-1' }]);
    tables.notify('dogs');

    await waitFor(() => expect(result.current.hasLocalEntryToday).toBe(true));
  });

  it('stops listening to the replicas on unmount', async () => {
    const { result, unmount } = renderLocalEntry('person-1');
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // Every source the answer derives from is subscribed, trials included.
    for (const table of ['shows', 'trials', 'entries', 'dogs']) {
      expect(tables.listeners.get(table)?.size, table).toBe(1);
    }

    unmount();

    for (const set of tables.listeners.values()) expect(set.size).toBe(0);
  });
});
