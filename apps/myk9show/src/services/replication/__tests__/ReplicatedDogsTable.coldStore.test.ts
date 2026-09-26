/**
 * A cold (never-synced) or unreadable local store returns zero rows from
 * getAll() with no error, which downstream reads as "this exhibitor owns no
 * dogs". getAllDogsWithStatus keeps the two apart.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { replicatedDogsTable, type ReplicatedDog } from '../ReplicatedDogsTable';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn() },
}));

const dog = { id: 'dog-1', name: 'Ziva', breed: 'Malinois' } as ReplicatedDog;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ReplicatedDogsTable.getAllDogsWithStatus', () => {
  it('reports a failed local read as cold', async () => {
    vi.spyOn(replicatedDogsTable, 'getAllWithStatus').mockResolvedValue({
      ok: false,
      rows: [],
      error: new Error('IndexedDB timed out'),
    });
    const metadata = vi.spyOn(replicatedDogsTable, 'getSyncMetadata');

    await expect(replicatedDogsTable.getAllDogsWithStatus()).resolves.toEqual({
      rows: [],
      cold: true,
    });
    expect(metadata).not.toHaveBeenCalled();
  });

  it('reports an empty store that has never synced as cold', async () => {
    vi.spyOn(replicatedDogsTable, 'getAllWithStatus').mockResolvedValue({
      ok: true,
      rows: [],
      error: null,
    });
    vi.spyOn(replicatedDogsTable, 'getSyncMetadata').mockResolvedValue(null);

    await expect(replicatedDogsTable.getAllDogsWithStatus()).resolves.toEqual({
      rows: [],
      cold: true,
    });
  });

  it('reports an empty store that HAS synced as genuinely empty', async () => {
    vi.spyOn(replicatedDogsTable, 'getAllWithStatus').mockResolvedValue({
      ok: true,
      rows: [],
      error: null,
    });
    vi.spyOn(replicatedDogsTable, 'getSyncMetadata').mockResolvedValue({
      tableName: 'dogs',
      lastFullSyncAt: 1_700_000_000_000,
      lastIncrementalSyncAt: 1_700_000_000_000,
    });

    await expect(replicatedDogsTable.getAllDogsWithStatus()).resolves.toEqual({
      rows: [],
      cold: false,
    });
  });

  it('never calls a store with rows cold', async () => {
    vi.spyOn(replicatedDogsTable, 'getAllWithStatus').mockResolvedValue({
      ok: true,
      rows: [dog],
      error: null,
    });

    await expect(replicatedDogsTable.getAllDogsWithStatus()).resolves.toEqual({
      rows: [dog],
      cold: false,
    });
  });
});
