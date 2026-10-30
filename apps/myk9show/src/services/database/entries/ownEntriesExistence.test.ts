// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { eq, is, select, from, getAllOrThrow, getAllDogs } = vi.hoisted(() => {
  const is = vi.fn();
  const eq = vi.fn(() => ({ is }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { eq, is, select, from, getAllOrThrow: vi.fn(), getAllDogs: vi.fn() };
});

vi.mock('../supabaseClient', () => ({ supabase: { from } }));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { getAllOrThrow },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { getAllDogs },
}));

import { localReplicaHasOwnEntry, serverHasOwnEntries } from './ownEntriesExistence';

describe('serverHasOwnEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    is.mockResolvedValue({ count: 0, error: null });
  });

  it('counts only live own rows: names the id column and filters soft-deleted entries', async () => {
    await serverHasOwnEntries();

    expect(from).toHaveBeenCalledWith('view_authenticated_entry_results');
    expect(select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(eq).toHaveBeenCalledWith('is_own_entry', true);
    expect(is).toHaveBeenCalledWith('deleted_at', null);
  });

  it('reports true only when live rows exist', async () => {
    is.mockResolvedValueOnce({ count: 2, error: null });
    await expect(serverHasOwnEntries()).resolves.toBe(true);
    is.mockResolvedValueOnce({ count: 0, error: null });
    await expect(serverHasOwnEntries()).resolves.toBe(false);
  });
});

describe('localReplicaHasOwnEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllDogs.mockResolvedValue([]);
  });

  it('is false when every own entry is soft-deleted', async () => {
    getAllOrThrow.mockResolvedValue([
      { id: 'e1', handlerId: 'p1', dogId: null, deletedAt: '2026-10-30T00:00:00Z' },
      { id: 'e2', handlerId: 'p1', dogId: null, deleted_at: '2026-10-30T00:00:00Z' },
    ]);
    await expect(localReplicaHasOwnEntry('p1')).resolves.toBe(false);
  });

  it('is true when one own entry is live', async () => {
    getAllOrThrow.mockResolvedValue([
      { id: 'e1', handlerId: 'p1', dogId: null, deletedAt: '2026-10-30T00:00:00Z' },
      { id: 'e2', handlerId: 'p1', dogId: null, deletedAt: null },
    ]);
    await expect(localReplicaHasOwnEntry('p1')).resolves.toBe(true);
  });
});
