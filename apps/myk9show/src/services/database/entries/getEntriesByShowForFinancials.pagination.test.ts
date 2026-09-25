import { createDatabaseError } from '@/services/database/databaseError';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MYK9-761 (Codex P2 on 477f33af6): the Financial Summary's online read is
 * summed as money, and PostgREST caps one response at `max_rows` (1000). An
 * unpaginated read of a larger show silently understates the totals, so the
 * read pages until a short page, and any failed page fails the whole read.
 */

const MAX_ROWS = 1000;

const { mockEntriesTable, server } = vi.hoisted(() => ({
  mockEntriesTable: {
    sync: vi.fn(),
    getEntriesByShow: vi.fn(),
    getSyncMetadata: vi.fn(),
    getReplicatedRow: vi.fn(),
  },
  server: {
    rows: [] as Array<Record<string, unknown>>,
    failFrom: null as number | null,
    ranges: [] as Array<[number, number]>,
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

// A PostgREST builder that, like the real server, never returns more than
// `max_rows` rows, whether or not the caller asked for a range.
vi.mock('@/services/database/supabaseClient', () => {
  const respond = (from: number, to: number) => {
    server.ranges.push([from, to]);
    if (server.failFrom !== null && from >= server.failFrom) {
      return Promise.resolve({ data: null, error: { message: 'upstream timeout', code: '57014' } });
    }
    const end = Math.min(to + 1, from + MAX_ROWS);
    return Promise.resolve({ data: server.rows.slice(from, end), error: null });
  };
  const builder = {
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    order: () => builder,
    range: (from: number, to: number) => respond(from, to),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      respond(0, Number.MAX_SAFE_INTEGER).then(resolve, reject),
  };
  return { supabase: { from: () => builder }, logQuery: vi.fn(), createDatabaseError };
});

import { getEntriesByShowForFinancials } from '@/services/database/entries';

describe('getEntriesByShowForFinancials online read, larger than one PostgREST page', () => {
  beforeEach(() => {
    // A never-synced show whose one local row holds no unsaved write: the read
    // goes online (see getEntriesByShowForFinancials.showSync.test.ts).
    mockEntriesTable.sync.mockReset();
    mockEntriesTable.sync.mockResolvedValue({ success: false });
    mockEntriesTable.getSyncMetadata.mockReset();
    mockEntriesTable.getSyncMetadata.mockResolvedValue({ tableName: 'entries' });
    mockEntriesTable.getEntriesByShow.mockReset();
    mockEntriesTable.getEntriesByShow.mockResolvedValue([
      { id: 'entry-0', showId: 's1', dogId: null, classId: null, deletedAt: null },
    ]);
    mockEntriesTable.getReplicatedRow.mockReset();
    mockEntriesTable.getReplicatedRow.mockResolvedValue({ isDirty: false });
    server.rows = Array.from({ length: 2345 }, (_, i) => ({
      id: `entry-${i}`,
      show_id: 's1',
      entry_fee: 35,
    }));
    server.failFrom = null;
    server.ranges = [];
  });

  it('returns every row across pages, not the first 1000', async () => {
    const result = await getEntriesByShowForFinancials('s1');

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(2345);
    expect(new Set(result.data.map(row => (row as Record<string, unknown>).id)).size).toBe(2345);
  });

  it('fails the whole read when a later page fails, never a partial total', async () => {
    server.failFrom = MAX_ROWS;

    const result = await getEntriesByShowForFinancials('s1');

    // The Financial Summary throws on `error`, so no total is rendered at all.
    expect(result.error).not.toBeNull();
    expect(result.data).not.toHaveLength(MAX_ROWS);
  });
});
