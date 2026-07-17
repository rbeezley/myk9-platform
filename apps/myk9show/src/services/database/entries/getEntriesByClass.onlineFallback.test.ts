import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEntriesTable, mockDogsTable } = vi.hoisted(() => ({
  mockEntriesTable: { getEntriesByClass: vi.fn() },
  mockDogsTable: { getAllDogs: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: mockEntriesTable,
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: mockDogsTable,
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: { getAll: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: { getAllShows: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { getAll: vi.fn().mockResolvedValue([]) },
}));

const defaultOnlineRows = [
  {
    id: 'entry-online-1',
    class_id: 'class-1',
    show_id: 'show-1',
    dog_id: 'dog-1',
    armband: '101',
  },
];
let onlineRows = defaultOnlineRows;

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            order: () => Promise.resolve({ data: onlineRows, error: null }),
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

import { getEntriesByClass } from '@/services/database/entries';

describe('getEntriesByClass — cold local replica verifies online', () => {
  beforeEach(() => {
    onlineRows = defaultOnlineRows;
  });

  it('returns authoritative rows when the class-scoped replica is empty', async () => {
    mockEntriesTable.getEntriesByClass.mockResolvedValue([]);

    const result = await getEntriesByClass('class-1');

    expect(result.data).toHaveLength(1);
    expect((result.data[0] as Record<string, unknown>).id).toBe('entry-online-1');
  });

  it('does not resurrect a class entry with a queued local deletion', async () => {
    mockEntriesTable.getEntriesByClass.mockResolvedValue([
      {
        id: 'entry-tombstoned',
        classId: 'class-1',
        showId: 'show-1',
        dogId: 'dog-1',
        deletedAt: '2026-07-17T00:00:00.000Z',
      },
    ]);
    onlineRows = [{ ...defaultOnlineRows[0], id: 'entry-tombstoned' }];

    const result = await getEntriesByClass('class-1');

    expect(result.data).toHaveLength(0);
  });
});
