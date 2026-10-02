import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ pending: vi.fn(), showUnsynced: vi.fn() }));
vi.mock('@/services/replication/sharedMutationManager', () => ({
  mutationManager: { getPendingMutationsForRow: mocks.pending },
}));
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: { hasUnsyncedWork: mocks.showUnsynced },
}));

import { hasUnsyncedWork } from './deleteUnsyncedWork';

describe('hasUnsyncedWork: every kind with a replica, not only shows', () => {
  beforeEach(() => {
    mocks.pending.mockReset().mockResolvedValue([]);
    mocks.showUnsynced.mockReset().mockResolvedValue(false);
  });

  it('a show asks the shows table, which also counts a row created here', async () => {
    mocks.showUnsynced.mockResolvedValue(true);
    await expect(hasUnsyncedWork('show', 's1')).resolves.toBe(true);
    expect(mocks.showUnsynced).toHaveBeenCalledWith('s1');
  });

  it.each([
    ['trial', 'trials'],
    ['class', 'classes'],
    ['entry', 'entries'],
    ['dog', 'dogs'],
    ['club', 'clubs'],
  ] as const)('a %s with a queued mutation is unsynced (table %s)', async (kind, table) => {
    mocks.pending.mockResolvedValue([{ id: 'm1' }]);
    await expect(hasUnsyncedWork(kind, 'x1')).resolves.toBe(true);
    expect(mocks.pending).toHaveBeenCalledWith(table, 'x1');
  });

  it('nothing queued is synced; an unreadable queue throws', async () => {
    await expect(hasUnsyncedWork('trial', 't1')).resolves.toBe(false);
    mocks.pending.mockRejectedValue(new Error('queue unavailable'));
    await expect(hasUnsyncedWork('trial', 't1')).rejects.toThrow('queue unavailable');
  });

  it('a person has no replica to wait on', async () => {
    await expect(hasUnsyncedWork('person', 'p1')).resolves.toBe(false);
    expect(mocks.pending).not.toHaveBeenCalled();
  });
});
