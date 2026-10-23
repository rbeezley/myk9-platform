import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFrom, queryIn, session } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  queryIn: vi.fn(),
  session: { userId: 'user-a' as string | null },
}));

vi.mock('@/services/database/persistedAuthUserId', () => ({
  readPersistedAuthUserId: () => session.userId,
}));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: mockFrom },
}));

import { ReplicatedShowsTable } from './ReplicatedShowsTable';

/**
 * MYK9-1348: a cold at-show load used to reset every watermark and re-download every visible
 * show to find one row. `pullShowById` fetches just that show through the table's refetch
 * adapter and writes it as a clean server row, touching no sync metadata.
 */
const showRow = (id: string) => ({
  id,
  name: `Show ${id}`,
  organization: 'AKC',
  start_date: '2026-11-10',
  end_date: '2026-11-11',
  club_id: 'club-1',
  status: 'open',
  version: 7,
  updated_at: '2026-10-01T00:00:00Z',
});

function serverReturns(rows: ReturnType<typeof showRow>[]) {
  queryIn.mockImplementation(async () => ({ data: rows, error: null }));
}

describe('ReplicatedShowsTable.pullShowById (MYK9-1348)', () => {
  beforeEach(async () => {
    // The fake IndexedDB outlives a test: start each one from an empty replica.
    await new ReplicatedShowsTable().clearCache();
    vi.clearAllMocks();
    session.userId = 'user-a';
    mockFrom.mockImplementation(() => ({
      select: () => ({ is: () => ({ in: queryIn }) }),
    }));
  });

  it('stores the one row and leaves every scope watermark and the table watermark alone', async () => {
    const table = new ReplicatedShowsTable();
    await table.updateSyncMetadata({ lastIncrementalSyncAt: 5678 });
    await table.updateSyncMetadata({ lastIncrementalSyncAt: 1234 }, { scopeValue: 'club-1' });
    serverReturns([showRow('s1')]);

    const pulled = await table.pullShowById('s1');

    expect(queryIn).toHaveBeenCalledWith('id', ['s1']);
    expect(pulled).toMatchObject({ id: 's1', name: 'Show s1', clubId: 'club-1' });
    await expect(table.getShowById('s1')).resolves.toMatchObject({ id: 's1', serverVersion: 7 });
    expect((await table.getSyncMetadata())?.lastIncrementalSyncAt).toBe(5678);
    expect((await table.getSyncMetadata('club-1'))?.lastIncrementalSyncAt).toBe(1234);
  });

  it('resolves null and writes nothing when the server returns no row', async () => {
    const table = new ReplicatedShowsTable();
    serverReturns([]);

    await expect(table.pullShowById('ghost')).resolves.toBeNull();

    await expect(table.getShowById('ghost')).resolves.toBeNull();
    await expect(table.getAllShows()).resolves.toEqual([]);
  });

  it('propagates a failed fetch so the caller can call it unreachable', async () => {
    const table = new ReplicatedShowsTable();
    queryIn.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });

    await expect(table.pullShowById('s1')).rejects.toThrow(
      'Supabase query failed: Failed to fetch'
    );
  });

  it('shares one request between concurrent pulls of the same show', async () => {
    const table = new ReplicatedShowsTable();
    serverReturns([showRow('s1'), showRow('s2')]);

    const [first, second] = await Promise.all([table.pullShowById('s1'), table.pullShowById('s1')]);

    expect(queryIn).toHaveBeenCalledTimes(1);
    expect(first?.id).toBe('s1');
    expect(second).toEqual(first);
  });

  it('does not share a request across different shows', async () => {
    const table = new ReplicatedShowsTable();
    serverReturns([showRow('s1'), showRow('s2')]);

    await Promise.all([table.pullShowById('s1'), table.pullShowById('s2')]);

    expect(queryIn).toHaveBeenCalledTimes(2);
  });

  it('never overwrites a show with unsent local edits', async () => {
    const table = new ReplicatedShowsTable();
    await table.set(
      's1',
      { id: 's1', name: 'Edited locally', organization: 'AKC', startDate: 'a', endDate: 'b' },
      true
    );
    serverReturns([showRow('s1')]);

    const pulled = await table.pullShowById('s1');

    expect(pulled?.name).toBe('Edited locally');
    expect(queryIn).not.toHaveBeenCalled();
    await expect(table.getShowById('s1')).resolves.toMatchObject({ name: 'Edited locally' });
  });
});
