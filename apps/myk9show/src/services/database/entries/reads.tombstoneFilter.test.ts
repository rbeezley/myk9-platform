import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

// Regression for the offline-first tombstone leak: replication-backed entry
// reads must exclude soft-deleted entries (deletedAt OR deleted_at), mirroring
// the postgrest `.is('deleted_at', null)` filter. Without this a dog-delete
// cascade's tombstoned entries reappear in rosters/scoring after sync.
const mocks = vi.hoisted(() => ({
  createDatabaseError: vi.fn((error: unknown) =>
    error instanceof Error ? error : new Error(String(error))
  ),
  logQuery: vi.fn(),
  supabaseFrom: vi.fn(),
  getAll: vi.fn(),
  getEntriesByShow: vi.fn(),
  getEntriesByClass: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  createDatabaseError: mocks.createDatabaseError,
  logQuery: mocks.logQuery,
  supabase: { from: mocks.supabaseFrom },
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getAll: mocks.getAll,
    getEntriesByShow: mocks.getEntriesByShow,
    getEntriesByClass: mocks.getEntriesByClass,
  },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { getAllDogs: vi.fn().mockResolvedValue([]) },
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
vi.mock('@/services/replication/ReplicatedArmbandsTable', () => ({
  replicatedArmbandsTable: { getByShow: vi.fn().mockResolvedValue([]) },
}));
// Echo just the id so assertions are about WHICH entries survive the filter.
vi.mock('@/services/mappers/entryMappers', () => ({
  mapReplicatedEntryToDbRow: (entry: { id: string }) => ({ id: entry.id }),
}));

import { getEntriesByShow, getEntriesByDog } from './reads';

const DOG = 'dog-1';
const SHOW = 'show-1';

function entry(id: string, extra: Partial<ReplicatedEntry> = {}): ReplicatedEntry {
  return {
    id,
    dogId: DOG,
    showId: SHOW,
    classId: 'class-1',
    ...extra,
  } as ReplicatedEntry;
}

const live = entry('live');
const tombstoneCamel = entry('camel', { deletedAt: '2026-06-16T00:00:00Z' });
const tombstoneSnake = entry('snake', { deleted_at: '2026-06-16T00:00:00Z' });

describe('replication-backed entry reads exclude tombstones', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getEntriesByShow drops entries tombstoned via deletedAt and deleted_at', async () => {
    mocks.getEntriesByShow.mockResolvedValue([live, tombstoneCamel, tombstoneSnake]);

    const { data } = await getEntriesByShow(SHOW);

    expect(data.map(d => (d as { id: string }).id)).toEqual(['live']);
  });

  it('getEntriesByDog drops entries tombstoned via deletedAt and deleted_at', async () => {
    mocks.getAll.mockResolvedValue([live, tombstoneCamel, tombstoneSnake]);

    const { data } = await getEntriesByDog(DOG);

    expect(data.map(d => (d as { id: string }).id)).toEqual(['live']);
  });
});
