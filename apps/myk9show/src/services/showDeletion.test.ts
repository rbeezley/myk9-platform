import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  serverDelete: vi.fn(),
  discard: vi.fn(),
}));

vi.mock('@/services/database/shows/writes', () => ({ deleteShow: mocks.serverDelete }));
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: { discardPendingLocalCreate: mocks.discard },
}));

import { deleteShowRecord } from './showDeletion';

describe('deleteShowRecord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels a pending local create and never calls the server', async () => {
    mocks.discard.mockResolvedValue(true);

    const result = await deleteShowRecord('local-show');

    expect(mocks.discard).toHaveBeenCalledWith('local-show');
    expect(mocks.serverDelete).not.toHaveBeenCalled();
    expect(result.error).toBeNull();
  });

  it('deletes on the server when there is no pending local create', async () => {
    mocks.discard.mockResolvedValue(false);
    mocks.serverDelete.mockResolvedValue({ data: { id: 's' }, error: null });

    await deleteShowRecord('s', 'user-1');

    expect(mocks.serverDelete).toHaveBeenCalledWith('s', 'user-1');
  });

  it('reports a failed queue read as an error and does not call the server', async () => {
    mocks.discard.mockRejectedValue(new Error('queue unavailable'));

    const result = await deleteShowRecord('s');

    expect(result.error).toMatchObject({ message: 'queue unavailable' });
    expect(mocks.serverDelete).not.toHaveBeenCalled();
  });
});
