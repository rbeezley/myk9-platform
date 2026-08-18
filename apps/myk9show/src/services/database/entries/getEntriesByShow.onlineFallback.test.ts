import { createDatabaseError } from '@/services/database/databaseError';
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

const defaultOnlineRow = { id: 'entry-online-1', show_id: 's1', class: { id: 'c1' } };
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
  createDatabaseError,
}));

import { getEntriesByShow } from '@/services/database/entries';

describe('getEntriesByShow — cold local replica verifies online', () => {
  beforeEach(() => {
    onlineRows = [defaultOnlineRow];
  });

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

  it('does not resurrect a locally-tombstoned entry the server still returns as live', async () => {
    // A queued soft-delete not yet synced: isLiveEntry filters the row out, so
    // the mapped result is empty and the online read runs. The server hasn't
    // seen the delete yet, so it still returns that same entry as live — it must
    // NOT reappear. (A show is a single replication unit, so the only online row
    // in scope here is the tombstoned one.)
    mockEntriesTable.getEntriesByShow.mockResolvedValue([
      {
        id: 'entry-tombstoned',
        dogId: null,
        classId: null,
        showId: 's1',
        registrationId: null,
        deletedAt: '2026-07-09T00:00:00.000Z',
        entryStatus: 'confirmed',
      },
    ]);
    onlineRows = [{ id: 'entry-tombstoned', show_id: 's1', class: { id: 'c1' } }];

    const result = await getEntriesByShow('s1');

    expect(result.data).toHaveLength(0);
    expect(result.data.some(r => (r as Record<string, unknown>).id === 'entry-tombstoned')).toBe(
      false
    );
  });
});
