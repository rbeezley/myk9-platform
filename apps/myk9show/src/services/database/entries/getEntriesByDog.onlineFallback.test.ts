import { describe, it, expect, vi } from 'vitest';

/**
 * exhibitor-count-integrity: getEntriesByDog must verify online when the
 * local replica has zero rows for a dog, instead of trusting an empty local
 * result as truth (entries replicate per-show — see the comment above
 * countActiveEntriesByDog in reads.ts documenting the same class of bug).
 *
 * Isolated from entryQueries.replication.test.ts because that file's shared
 * supabase mock doesn't support the `.eq().is().order()` chain
 * postgrestGetEntriesByDog needs — adding it there would touch ~40 unrelated
 * tests' shared fixture.
 */

const { mockEntriesTable, mockDogsTable, mockClassesTable, mockShowsTable, mockTrialsTable } =
  vi.hoisted(() => ({
    mockEntriesTable: { getAll: vi.fn() },
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

const onlineRow = { id: 'entry-online-1', dog_id: 'dog-1', class: { id: 'c1' }, show: { id: 's1' } };

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

import { getEntriesByDog } from '@/services/database/entries';

describe('getEntriesByDog — cold local replica verifies online', () => {
  it('falls back to the online read when the local replica has zero rows for the dog', async () => {
    mockEntriesTable.getAll.mockResolvedValue([]);

    const result = await getEntriesByDog('dog-1');

    expect(result.data).toHaveLength(1);
    expect((result.data[0] as Record<string, unknown>).id).toBe('entry-online-1');
  });

  it('does not call online when the local replica already has the dog’s entries', async () => {
    mockEntriesTable.getAll.mockResolvedValue([
      {
        id: 'entry-local-1',
        dogId: 'dog-1',
        classId: null,
        showId: null,
        deletedAt: null,
        entryStatus: 'confirmed',
      },
    ]);

    const result = await getEntriesByDog('dog-1');

    expect(result.data).toHaveLength(1);
    expect((result.data[0] as Record<string, unknown>).id).toBe('entry-local-1');
  });

  it('does NOT online-verify when the dog’s local rows are all tombstoned (offline delete wins)', async () => {
    // A queued soft-delete not yet synced: isLiveEntry filters the row out, so
    // the mapped result is empty — but the raw local replica had a row for this
    // dog, so falling back to the (stale) server would resurrect the deleted
    // entry. The raw-count guard must keep the result empty.
    mockEntriesTable.getAll.mockResolvedValue([
      {
        id: 'entry-tombstoned',
        dogId: 'dog-1',
        classId: null,
        showId: null,
        deletedAt: '2026-07-09T00:00:00.000Z',
        entryStatus: 'confirmed',
      },
    ]);

    const result = await getEntriesByDog('dog-1');

    // Empty (the tombstone), and specifically NOT the online row.
    expect(result.data).toHaveLength(0);
    expect(result.data.some(r => (r as Record<string, unknown>).id === 'entry-online-1')).toBe(
      false
    );
  });
});
