import { describe, it, expect, vi } from 'vitest';

/**
 * exhibitor-count-integrity (audit #4): getEntriesByShow must verify online when
 * the local replica has zero rows for a show, instead of trusting an empty local
 * result as truth (entries replicate per-show). This drives the styled landing
 * page's "Entries received" count (entries.length); before the fix a cold
 * session showed "0 Entries received" while the exhibitor had entries.
 *
 * Isolated from entryQueries.replication.test.ts for the same reason as
 * getEntriesByDog.onlineFallback.test.ts: that file's shared supabase mock
 * doesn't support the `.eq().is().order()` chain postgrestGetEntriesByShow needs.
 */

const { mockEntriesTable, mockDogsTable, mockClassesTable, mockShowsTable, mockTrialsTable } =
  vi.hoisted(() => ({
    mockEntriesTable: { getEntriesByShow: vi.fn(), getAll: vi.fn().mockResolvedValue([]) },
    mockDogsTable: { getAllDogs: vi.fn().mockResolvedValue([]) },
    mockClassesTable: { getAll: vi.fn().mockResolvedValue([]) },
    mockShowsTable: { getAllShows: vi.fn().mockResolvedValue([]) },
    mockTrialsTable: { getAll: vi.fn().mockResolvedValue([]) },
  }));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: mockEntriesTable,
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: mockDogsTable,
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: mockClassesTable,
}));
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: mockShowsTable,
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: mockTrialsTable,
}));

const onlineRow = { id: 'entry-online-1', show_id: 's1', class: { id: 'c1' } };

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            order: () => Promise.resolve({ data: [onlineRow], error: null }),
          }),
        }),
      }),
    }),
  },
  logQuery: vi.fn(),
  createDatabaseError: vi.fn((error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
    code: 'UNKNOWN',
  })),
}));

import { getEntriesByShow } from '@/services/database/entries';

describe('getEntriesByShow — cold local replica verifies online', () => {
  it('falls back to the online read when the local replica has zero rows for the show', async () => {
    mockEntriesTable.getEntriesByShow.mockResolvedValue([]);

    const result = await getEntriesByShow('s1');

    expect(result.data).toHaveLength(1);
    expect((result.data[0] as Record<string, unknown>).id).toBe('entry-online-1');
  });

  it('does not call online when the local replica already has the show’s entries', async () => {
    mockEntriesTable.getEntriesByShow.mockResolvedValue([
      {
        id: 'entry-local-1',
        dogId: null,
        classId: null,
        showId: 's1',
        registrationId: null,
        deletedAt: null,
        entryStatus: 'confirmed',
      },
    ]);

    const result = await getEntriesByShow('s1');

    expect(result.data).toHaveLength(1);
    expect((result.data[0] as Record<string, unknown>).id).toBe('entry-local-1');
  });
});
