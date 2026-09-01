import { createDatabaseError } from '@/services/database/databaseError';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * MYK9-283: getEntriesByClass and getEntriesByTrial must verify online when the
 * local replica has zero rows for the scope, instead of trusting an empty local
 * result as truth.
 *
 * Entries replicate PER SHOW, so a class in a show the caller has not opened
 * this session reads empty locally — and readWithReplicationFallback only falls
 * back to `postgrest` on a THROW, never on a legitimately-shaped-but-cold empty
 * array. The Reports page then reached `dataState: 'ready'` with no rows and
 * printed "No entries found for this selection" over a class holding 63
 * entries, on roughly one cold load in six, and never retracted it because
 * nothing re-ran when the store later filled. The check-in sheet is the sheet a
 * secretary prints on show morning.
 *
 * A class and a trial each sit ENTIRELY inside one per-show replication unit,
 * so unlike the dog scope (getEntriesByDog.onlineFallback.test.ts) empty is the
 * only way these reads can be wrong — which is what `verifyOnlineWhenEmpty`
 * covers.
 *
 * Isolated from entryQueries.replication.test.ts for the same reason as its
 * sibling files: that file's shared supabase mock doesn't support the
 * `.eq().is().order()` chain these postgrest reads need.
 */

const { mockEntriesTable, mockDogsTable, mockClassesTable, mockShowsTable, mockTrialsTable } =
  vi.hoisted(() => ({
    mockEntriesTable: {
      getEntriesByClass: vi.fn(),
      getAll: vi.fn().mockResolvedValue([]),
    },
    mockDogsTable: { getAllDogs: vi.fn().mockResolvedValue([]) },
    mockClassesTable: {
      getAll: vi.fn().mockResolvedValue([]),
      getClassesByTrial: vi.fn().mockResolvedValue([]),
    },
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

const defaultOnlineRow = { id: 'entry-online-1', class: { id: 'c1' } };
let onlineRows: Array<Record<string, unknown>> = [defaultOnlineRow];
let onlineCallCount = 0;

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            order: () => {
              onlineCallCount += 1;
              return Promise.resolve({ data: onlineRows, error: null });
            },
          }),
        }),
      }),
    }),
  },
  logQuery: vi.fn(),
  createDatabaseError,
}));

import { getEntriesByClass, getEntriesByTrial } from '@/services/database/entries';

describe('getEntriesByClass — cold local replica verifies online', () => {
  beforeEach(() => {
    onlineRows = [defaultOnlineRow];
    onlineCallCount = 0;
  });

  it('falls back to the online read when the local replica has zero rows for the class', async () => {
    mockEntriesTable.getEntriesByClass.mockResolvedValue([]);

    const result = await getEntriesByClass('c1');

    expect(result.data).toHaveLength(1);
    expect((result.data[0] as Record<string, unknown>).id).toBe('entry-online-1');
  });

  it('does not call online when the local replica already has the class’s entries', async () => {
    mockEntriesTable.getEntriesByClass.mockResolvedValue([
      {
        id: 'entry-local-1',
        dogId: null,
        classId: 'c1',
        showId: 's1',
        registrationId: null,
        deletedAt: null,
        entryStatus: 'confirmed',
        runOrder: 1,
      },
    ]);

    const result = await getEntriesByClass('c1');

    expect(result.data).toHaveLength(1);
    expect((result.data[0] as Record<string, unknown>).id).toBe('entry-local-1');
    expect(onlineCallCount).toBe(0);
  });

  it('does not resurrect a locally-tombstoned entry the server still returns as live', async () => {
    // A queued soft-delete not yet synced: isLiveEntry filters it out, so the
    // mapped result is empty and the online read runs. The server has not seen
    // the delete, so it still returns that entry — it must NOT reappear.
    mockEntriesTable.getEntriesByClass.mockResolvedValue([
      {
        id: 'entry-tombstoned',
        dogId: null,
        classId: 'c1',
        showId: 's1',
        registrationId: null,
        deletedAt: '2026-08-31T00:00:00.000Z',
        entryStatus: 'confirmed',
        runOrder: 1,
      },
    ]);
    onlineRows = [{ id: 'entry-tombstoned', class: { id: 'c1' } }];

    const result = await getEntriesByClass('c1');

    expect(result.data).toHaveLength(0);
  });
});

describe('getEntriesByTrial — cold local replica verifies online', () => {
  beforeEach(() => {
    onlineRows = [defaultOnlineRow];
    onlineCallCount = 0;
    mockClassesTable.getClassesByTrial.mockResolvedValue([{ id: 'c1', trialId: 't1' }]);
    mockEntriesTable.getAll.mockResolvedValue([]);
  });

  it('falls back to the online read when the local replica has zero rows for the trial', async () => {
    const result = await getEntriesByTrial('t1');

    expect(result.data).toHaveLength(1);
    expect((result.data[0] as Record<string, unknown>).id).toBe('entry-online-1');
  });

  it('does not resurrect a locally-tombstoned entry the server still returns as live', async () => {
    // Caught in review of the first cut of this fix: the trial read opted into
    // verifyOnlineWhenEmpty without reporting its tombstones, so a replica
    // holding ONLY a queued delete filtered to empty, triggered the online
    // read, and the not-yet-synced server row put the entry back on the
    // check-in sheet.
    mockEntriesTable.getAll.mockResolvedValue([
      {
        id: 'entry-tombstoned',
        dogId: null,
        classId: 'c1',
        showId: 's1',
        registrationId: null,
        deletedAt: '2026-08-31T00:00:00.000Z',
        entryStatus: 'confirmed',
      },
    ]);
    onlineRows = [{ id: 'entry-tombstoned', class: { id: 'c1' } }];

    const result = await getEntriesByTrial('t1');

    expect(result.data).toHaveLength(0);
  });
});
