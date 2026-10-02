import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ pendingCount: vi.fn(), failed: vi.fn() }));

vi.mock('@/services/replication/sharedMutationManager', () => ({
  mutationManager: { getPendingCount: mocks.pendingCount, getFailedMutations: mocks.failed },
}));

import { deviceHasUnsavedWork } from './deleteUnsyncedWork';

describe('deviceHasUnsavedWork: one device-wide check, read from the queue', () => {
  beforeEach(() => {
    mocks.pendingCount.mockReset().mockResolvedValue(0);
    mocks.failed.mockReset().mockResolvedValue([]);
  });

  it('a clean device has nothing unsaved', async () => {
    await expect(deviceHasUnsavedWork()).resolves.toEqual({ total: 0, failed: 0 });
  });

  it('any pending mutation, on any table, counts', async () => {
    mocks.pendingCount.mockResolvedValue(3);
    await expect(deviceHasUnsavedWork()).resolves.toEqual({ total: 3, failed: 0 });
  });

  it('a failed mutation (e.g. a rejected INSERT) counts and is named as failed', async () => {
    mocks.failed.mockResolvedValue([{ id: 'm1' }]);
    await expect(deviceHasUnsavedWork()).resolves.toEqual({ total: 1, failed: 1 });
  });

  it('pending and failed work add up', async () => {
    mocks.pendingCount.mockResolvedValue(2);
    mocks.failed.mockResolvedValue([{ id: 'm1' }]);
    await expect(deviceHasUnsavedWork()).resolves.toEqual({ total: 3, failed: 1 });
  });

  it('reads no replica: a _localOnly row with nothing queued (an orphan) cannot block deletes', async () => {
    // The replicas are not even imported, so an orphan row has no way to count.
    await expect(deviceHasUnsavedWork()).resolves.toEqual({ total: 0, failed: 0 });
  });

  it('an unreadable queue throws: never a pass', async () => {
    mocks.pendingCount.mockRejectedValue(new Error('queue unavailable'));
    await expect(deviceHasUnsavedWork()).rejects.toThrow('queue unavailable');
    mocks.pendingCount.mockResolvedValue(0);
    mocks.failed.mockRejectedValue(new Error('failed queue unreadable'));
    await expect(deviceHasUnsavedWork()).rejects.toThrow('failed queue unreadable');
  });
});
