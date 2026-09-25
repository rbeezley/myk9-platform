import { createDatabaseError } from '@/services/database/databaseError';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MYK9-761: show-scoped entry statistics count and sum a show's entries. On a
 * device that has never synced the show, the replica holds only what this
 * device wrote, so those rows are never the show's statistics.
 */

const mocks = vi.hoisted(() => ({
  getEntriesByShow: vi.fn(),
  getSyncMetadata: vi.fn(),
  getReplicatedRow: vi.fn(),
  onlineRows: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getEntriesByShow: mocks.getEntriesByShow,
    getSyncMetadata: mocks.getSyncMetadata,
    getReplicatedRow: mocks.getReplicatedRow,
  },
}));

vi.mock('../supabaseClient', () => {
  const query = {
    select: () => query,
    is: () => query,
    eq: () => Promise.resolve({ data: mocks.onlineRows, error: null }),
  };
  return { supabase: { from: () => query }, logQuery: vi.fn(), createDatabaseError };
});

import { getEntryStatistics } from './search';

const oneLocalWrite = {
  id: 'checked-in-here',
  showId: 'show-1',
  entryStatus: 'confirmed',
  entryFee: 35,
  paymentStatus: 'paid',
};

describe('getEntryStatistics for a show that has not synced (MYK9-761)', () => {
  beforeEach(() => {
    mocks.getEntriesByShow.mockReset();
    mocks.getEntriesByShow.mockResolvedValue([oneLocalWrite]);
    mocks.getSyncMetadata.mockReset();
    mocks.getSyncMetadata.mockResolvedValue({ tableName: 'entries' });
    mocks.getReplicatedRow.mockReset();
    mocks.getReplicatedRow.mockResolvedValue({ isDirty: false });
    mocks.onlineRows = [
      { entry_status: 'confirmed', entry_fee: 35, payment_status: 'paid' },
      { entry_status: 'confirmed', entry_fee: 35, payment_status: 'pending' },
    ];
  });

  it('reads the show online instead of counting the one local row', async () => {
    const result = await getEntryStatistics('show-1');

    expect(result.error).toBeNull();
    expect(result.data.totalEntries).toBe(2);
    expect(result.data.totalRevenue).toBe(70);
  });

  it('reports an error while the local row holds an unsaved write', async () => {
    mocks.getReplicatedRow.mockResolvedValue({ isDirty: true });

    const result = await getEntryStatistics('show-1');

    expect(result.error).not.toBeNull();
    expect(result.data.totalEntries).toBe(0);
  });

  it('counts locally once the show has synced', async () => {
    mocks.getSyncMetadata.mockResolvedValue({ tableName: 'entries', totalRows: 1 });

    const result = await getEntryStatistics('show-1');

    expect(result.error).toBeNull();
    expect(result.data.totalEntries).toBe(1);
  });
});
