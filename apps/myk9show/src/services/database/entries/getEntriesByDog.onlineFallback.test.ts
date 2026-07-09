import { describe, it, expect, vi, beforeEach } from 'vitest';

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

const defaultOnlineRow = {
  id: 'entry-online-1',
  dog_id: 'dog-1',
  class: { id: 'c1' },
  show: { id: 's1' },
};
// Mutable so individual tests can model what the SERVER still returns (e.g. a
// row whose delete has not yet synced is still live server-side).
let onlineRows: Array<Record<string, unknown>> = [defaultOnlineRow];

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

import { getEntriesByDog } from '@/services/database/entries';

describe('getEntriesByDog — cold local replica verifies online', () => {
  beforeEach(() => {
    onlineRows = [defaultOnlineRow];
  });

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

  it('does not resurrect a locally-tombstoned entry the server still returns as live', async () => {
    // A queued soft-delete not yet synced: isLiveEntry filters the row out, so
    // the mapped result is empty and the online read runs. The server hasn't
    // seen the delete yet, so it still returns that same entry as live — it must
    // NOT reappear.
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
    onlineRows = [{ id: 'entry-tombstoned', dog_id: 'dog-1', class: { id: 'c1' }, show: { id: 's1' } }];

    const result = await getEntriesByDog('dog-1');

    expect(result.data).toHaveLength(0);
    expect(result.data.some(r => (r as Record<string, unknown>).id === 'entry-tombstoned')).toBe(
      false
    );
  });

  it('surfaces a live entry in an unsynced show while excluding a locally-tombstoned one', async () => {
    // Cross-scope (Codex #1236): a dog's entries span multiple per-show stores.
    // The local replica holds a pending delete for one entry; another show has
    // not synced locally but holds a live entry. The online read must surface
    // the live entry and drop the deleted one — a coarse local-row count would
    // wrongly suppress the online read and hide the live entry.
    mockEntriesTable.getAll.mockResolvedValue([
      {
        id: 'entry-tombstoned',
        dogId: 'dog-1',
        classId: null,
        showId: 's1',
        deletedAt: '2026-07-09T00:00:00.000Z',
        entryStatus: 'confirmed',
      },
    ]);
    onlineRows = [
      { id: 'entry-tombstoned', dog_id: 'dog-1', class: { id: 'c1' }, show: { id: 's1' } },
      { id: 'entry-live-other-show', dog_id: 'dog-1', class: { id: 'c2' }, show: { id: 's2' } },
    ];

    const result = await getEntriesByDog('dog-1');

    expect(result.data).toHaveLength(1);
    expect((result.data[0] as Record<string, unknown>).id).toBe('entry-live-other-show');
  });
});
