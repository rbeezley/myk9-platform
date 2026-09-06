import { describe, expect, it, vi } from 'vitest';
import { getEntriesByShowFromReplication } from './reads';

const mocks = vi.hoisted(() => ({
  entries: vi.fn(),
  dogs: vi.fn(),
  classes: vi.fn(),
  shows: vi.fn(),
  fallback: vi.fn(),
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { getEntriesByShow: mocks.entries },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { getAllDogs: mocks.dogs },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: { getAll: mocks.classes },
}));
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: { getAllShows: mocks.shows },
}));
vi.mock('../_shared/read-shape', async importOriginal => ({
  ...(await importOriginal<typeof import('../_shared/read-shape')>()),
  readWithReplicationFallback: mocks.fallback,
}));

describe('getEntriesByShowFromReplication', () => {
  it('uses the guarded fallback contract for a cold replica', async () => {
    mocks.fallback.mockResolvedValue({ data: [], error: null });

    const result = await getEntriesByShowFromReplication('show-1');

    expect(result).toEqual({ data: [], error: null });
    expect(mocks.fallback).toHaveBeenCalledWith(
      expect.objectContaining({ verifyOnlineWhenEmpty: true })
    );
  });
});
