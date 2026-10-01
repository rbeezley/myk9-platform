import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyShowDeleteError } from '@/services/database/shows/deleteOutcome';

const mocks = vi.hoisted(() => ({
  serverDelete: vi.fn(),
  hasUnsyncedWork: vi.fn(),
}));

vi.mock('@/services/database/shows/writes', () => ({ deleteShow: mocks.serverDelete }));
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: { hasUnsyncedWork: mocks.hasUnsyncedWork },
}));

import { deleteShowRecord } from './showDeletion';

describe('deleteShowRecord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses a show with unsynced work as still saving, without calling the server', async () => {
    mocks.hasUnsyncedWork.mockResolvedValue(true);

    const result = await deleteShowRecord('s1');

    expect(result.data).toBeNull();
    expect(classifyShowDeleteError(result.error)).toBe('still-saving');
    expect(mocks.serverDelete).not.toHaveBeenCalled();
  });

  it('returns an error and does not call the server when the queue cannot be read', async () => {
    mocks.hasUnsyncedWork.mockRejectedValue(new Error('queue unavailable'));

    const result = await deleteShowRecord('s1');

    expect(result.error).toMatchObject({ message: 'queue unavailable' });
    expect(classifyShowDeleteError(result.error)).toBe('failed');
    expect(mocks.serverDelete).not.toHaveBeenCalled();
  });

  it('runs the server delete, and returns its result, when nothing is pending', async () => {
    mocks.hasUnsyncedWork.mockResolvedValue(false);
    const serverResult = { data: { id: 's1' }, error: null, alreadyDeleted: true };
    mocks.serverDelete.mockResolvedValue(serverResult);

    const result = await deleteShowRecord('s1', 'user-1');

    expect(mocks.serverDelete).toHaveBeenCalledWith('s1', 'user-1', {});
    expect(result).toBe(serverResult);
  });
});
