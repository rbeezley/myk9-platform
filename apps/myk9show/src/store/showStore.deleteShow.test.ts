import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StoreShow } from '@/types/show-types';

const mocks = vi.hoisted(() => ({
  softDelete: vi.fn(),
  replicaDelete: vi.fn(),
}));

vi.mock('@/services/showDeletion', () => ({ deleteShowRecord: mocks.softDelete }));
vi.mock('@/services/replication', () => ({
  replicatedShowsTable: { delete: mocks.replicaDelete, subscribe: vi.fn(() => () => {}) },
}));

import { useShowStore } from './showStore';

const show = (id: string) => ({ id, name: id }) as unknown as StoreShow;

describe('showStore.deleteShow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.replicaDelete.mockResolvedValue(undefined);
    useShowStore.setState({
      shows: [show('gone'), show('kept')],
      selectedShowId: 'gone',
      isLoading: false,
      error: null,
    });
  });

  it('drops the deleted show from the replica and the store, and clears its selection', async () => {
    mocks.softDelete.mockResolvedValue({ data: { id: 'gone' }, error: null });

    await useShowStore.getState().deleteShow('gone');

    expect(mocks.replicaDelete).toHaveBeenCalledWith('gone');
    expect(useShowStore.getState().shows.map(s => s.id)).toEqual(['kept']);
    expect(useShowStore.getState().selectedShowId).toBe('');
  });

  it('drops the show even when the server says it was already deleted', async () => {
    // writes.deleteShow maps "Show not found" to success + alreadyDeleted.
    mocks.softDelete.mockResolvedValue({
      data: { id: 'gone' },
      error: null,
      alreadyDeleted: true,
    });

    await useShowStore.getState().deleteShow('gone');

    expect(mocks.replicaDelete).toHaveBeenCalledWith('gone');
    expect(useShowStore.getState().shows.map(s => s.id)).toEqual(['kept']);
  });

  it('keeps the show listed and rejects on Permission denied', async () => {
    mocks.softDelete.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Permission denied'), { code: '42501' }),
    });

    await expect(useShowStore.getState().deleteShow('gone')).rejects.toThrow(/permission denied/i);

    expect(mocks.replicaDelete).not.toHaveBeenCalled();
    expect(useShowStore.getState().shows.map(s => s.id)).toEqual(['gone', 'kept']);
  });

  it('purgeDeletedShow is the one shared step: replica row and store entry both go', async () => {
    await useShowStore.getState().purgeDeletedShow('kept');

    expect(mocks.replicaDelete).toHaveBeenCalledWith('kept');
    expect(useShowStore.getState().shows.map(s => s.id)).toEqual(['gone']);
    expect(useShowStore.getState().selectedShowId).toBe('gone');
  });

  it('purgeDeletedShow never throws: a replica failure still drops the show from the store', async () => {
    mocks.replicaDelete.mockRejectedValueOnce(new Error('idb unavailable'));

    await expect(useShowStore.getState().purgeDeletedShow('kept')).resolves.toBeUndefined();

    expect(useShowStore.getState().shows.map(s => s.id)).toEqual(['gone']);
  });
});
