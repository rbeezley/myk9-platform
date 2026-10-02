import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const rows: Record<string, ReturnType<typeof vi.fn>> = {};
  const replica = (name: string) => {
    rows[name] = vi.fn();
    return { getAllOrThrow: rows[name] };
  };
  return { pendingCount: vi.fn(), failed: vi.fn(), rows, replica };
});

vi.mock('@/services/replication/sharedMutationManager', () => ({
  mutationManager: { getPendingCount: mocks.pendingCount, getFailedMutations: mocks.failed },
}));
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: mocks.replica('shows'),
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: mocks.replica('trials'),
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: mocks.replica('classes'),
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: mocks.replica('entries'),
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: mocks.replica('dogs'),
}));
vi.mock('@/services/replication/ReplicatedClubsTable', () => ({
  replicatedClubsTable: mocks.replica('clubs'),
}));

import { deviceHasUnsavedWork } from './deleteUnsyncedWork';

describe('deviceHasUnsavedWork: one device-wide check', () => {
  beforeEach(() => {
    mocks.pendingCount.mockReset().mockResolvedValue(0);
    mocks.failed.mockReset().mockResolvedValue([]);
    for (const fn of Object.values(mocks.rows)) fn.mockReset().mockResolvedValue([]);
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

  it('a local-only row counts even with nothing queued, in any replica a delete touches', async () => {
    mocks.rows.entries!.mockResolvedValue([{ id: 'e1', _localOnly: true }, { id: 'e2' }]);
    await expect(deviceHasUnsavedWork()).resolves.toEqual({ total: 1, failed: 0 });
  });

  it('a local-only row whose INSERT is pending is not counted twice', async () => {
    mocks.pendingCount.mockResolvedValue(1);
    mocks.rows.classes!.mockResolvedValue([{ id: 'c1', _localOnly: true }]);
    await expect(deviceHasUnsavedWork()).resolves.toEqual({ total: 1, failed: 0 });
  });

  it('an unreadable queue or replica throws: never a pass', async () => {
    mocks.pendingCount.mockRejectedValue(new Error('queue unavailable'));
    await expect(deviceHasUnsavedWork()).rejects.toThrow('queue unavailable');
    mocks.pendingCount.mockResolvedValue(0);
    mocks.rows.dogs!.mockRejectedValue(new Error('replica unreadable'));
    await expect(deviceHasUnsavedWork()).rejects.toThrow('replica unreadable');
  });
});
