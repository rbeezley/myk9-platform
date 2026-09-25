import { createDatabaseError } from '@/services/database/databaseError';
import { onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MYK9-761: the Financial Summary sums this read as money. On a device that has
 * never synced the show, a single local write (a check-in) leaves one row in
 * the replica; summing it reports one entry's fees as the whole show.
 */

const { mockEntriesTable, online } = vi.hoisted(() => ({
  mockEntriesTable: {
    sync: vi.fn(),
    getEntriesByShow: vi.fn(),
    getSyncMetadata: vi.fn(),
    getReplicatedRow: vi.fn(),
  },
  online: {
    rows: [] as Array<Record<string, unknown>>,
    error: null as unknown,
  },
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: mockEntriesTable,
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { getAllDogs: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: { getAll: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { getTrialsByShow: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/services/database/entries/handlerHydration', () => ({
  loadHandlerPeople: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock('@/services/database/supabaseClient', () => {
  const builder = {
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    order: () => builder,
    range: () =>
      online.error
        ? Promise.reject(online.error)
        : Promise.resolve({ data: online.rows, error: null }),
  };
  return { supabase: { from: () => builder }, logQuery: vi.fn(), createDatabaseError };
});

import { getEntriesByShowForFinancials } from '@/services/database/entries';

const localWrite = {
  id: 'checked-in-here',
  dogId: null,
  classId: null,
  showId: 's1',
  registrationId: null,
  deletedAt: null,
  entryStatus: 'confirmed',
  entryFee: 35,
};

describe('getEntriesByShowForFinancials on a show that has not synced (MYK9-761)', () => {
  beforeEach(() => {
    mockEntriesTable.sync.mockReset();
    mockEntriesTable.sync.mockResolvedValue({ success: false });
    mockEntriesTable.getSyncMetadata.mockReset();
    mockEntriesTable.getSyncMetadata.mockResolvedValue({ tableName: 'entries' });
    mockEntriesTable.getEntriesByShow.mockReset();
    mockEntriesTable.getEntriesByShow.mockResolvedValue([localWrite]);
    mockEntriesTable.getReplicatedRow.mockReset();
    mockEntriesTable.getReplicatedRow.mockImplementation(async (id: string) => ({
      id,
      isDirty: true,
    }));
    online.rows = [
      {
        id: 'checked-in-here',
        created_at: '2026-09-25T15:00:00.000Z',
        show_id: 's1',
        entry_fee: 35,
      },
      { id: 'other', created_at: '2026-09-20T15:00:00.000Z', show_id: 's1', entry_fee: 35 },
    ];
    online.error = null;
  });

  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('reports an error, not the one local row, while that write is unsaved', async () => {
    const result = await getEntriesByShowForFinancials('s1');

    expect(result.error).not.toBeNull();
    expect(mockEntriesTable.sync).toHaveBeenCalledWith('s1');
  });

  it('reads the whole show online when the local row holds no unsaved write', async () => {
    mockEntriesTable.getReplicatedRow.mockImplementation(async (id: string) => ({
      id,
      isDirty: false,
    }));

    const result = await getEntriesByShowForFinancials('s1');

    expect(result.error).toBeNull();
    expect(result.data.map(row => (row as Record<string, unknown>).id)).toEqual([
      'checked-in-here',
      'other',
    ]);
  });

  // Codex P2 on #2463: a failed local sync-metadata read must not block the
  // online read the financial summary falls back to.
  it('reads online when the local sync metadata cannot be read', async () => {
    mockEntriesTable.getSyncMetadata.mockRejectedValue(new Error('IndexedDB unavailable'));

    const result = await getEntriesByShowForFinancials('s1');

    expect(result.error).toBeNull();
    expect(result.data.map(row => (row as Record<string, unknown>).id)).toEqual([
      'checked-in-here',
      'other',
    ]);
  });

  it('reports an error offline instead of summing the one local row', async () => {
    onlineManager.setOnline(false);
    mockEntriesTable.getReplicatedRow.mockImplementation(async (id: string) => ({
      id,
      isDirty: false,
    }));
    online.error = new TypeError('Failed to fetch');

    const result = await getEntriesByShowForFinancials('s1');

    expect(result.error).not.toBeNull();
    expect(mockEntriesTable.sync).not.toHaveBeenCalled();
  });

  it('reads locally once the show has synced', async () => {
    mockEntriesTable.getSyncMetadata.mockResolvedValue({ tableName: 'entries', totalRows: 1 });
    online.error = new TypeError('Failed to fetch');

    const result = await getEntriesByShowForFinancials('s1');

    expect(result.error).toBeNull();
    expect(result.data.map(row => (row as Record<string, unknown>).id)).toEqual([
      'checked-in-here',
    ]);
    expect(mockEntriesTable.sync).not.toHaveBeenCalled();
  });
});
