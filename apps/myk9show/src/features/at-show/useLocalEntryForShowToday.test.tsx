import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient, renderHook, waitFor } from '@/test/utils/testUtils';
import { useLocalEntryForShowToday } from './useLocalEntryForShowToday';

const tables = vi.hoisted(() => ({
  getShowById: vi.fn(),
  getEntriesByShow: vi.fn(),
  getAllDogs: vi.fn(),
}));

vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: { getShowById: tables.getShowById },
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { getEntriesByShow: tables.getEntriesByShow },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { getAllDogs: tables.getAllDogs },
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
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(TODAY);
    tables.getShowById.mockReset().mockResolvedValue(LIVE_SHOW);
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

  it('uses the UTC calendar date the server compares, not the device-local date', async () => {
    // 01:00 UTC on the 23rd is still the 22nd in US zones; the RPC's
    // current_date is the 23rd, so a show that ended on the 22nd is over.
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 23, 1, 0, 0)));
    tables.getShowById.mockResolvedValue({ ...LIVE_SHOW, endDate: '2026-10-22' });

    const { result } = renderLocalEntry('person-1');

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(tables.getEntriesByShow).toHaveBeenCalled();
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
});
