import { beforeEach, describe, expect, it, vi } from 'vitest';

const pending = vi.hoisted(() => vi.fn());
vi.mock('./pendingWrites', () => ({ hasPendingLocalWritesOrUnknown: pending }));

import { UNSYNCED_UNREADABLE_MESSAGE, withReplicationFallback } from './replication-fallback';

const replicaUnreadable = () =>
  Promise.reject(
    Object.assign(new Error("This device couldn't read its saved show data. Try again."), {
      name: 'ReplicaReadError',
    })
  );
const SERVER_ROWS = [{ id: 'server-row' }];

/**
 * MYK9-774: when the device cannot read its replica, a read falls back to the
 * server. That server list shows any write this device has not uploaded as
 * undone, so the fallback asks the upload queue first, for every reader.
 */
describe('withReplicationFallback — unreadable replica, unsynced writes', () => {
  beforeEach(() => {
    pending.mockReset();
  });

  it('throws instead of serving the server list while a local write may not have uploaded', async () => {
    pending.mockResolvedValue(true);
    const postgrest = vi.fn(async () => SERVER_ROWS);

    await expect(
      withReplicationFallback(replicaUnreadable, postgrest, 'entries', 'select_test')
    ).rejects.toMatchObject({ message: UNSYNCED_UNREADABLE_MESSAGE });
    expect(postgrest).not.toHaveBeenCalled();
  });

  it('serves the server list when nothing is waiting to upload', async () => {
    pending.mockResolvedValue(false);
    const postgrest = vi.fn(async () => SERVER_ROWS);

    await expect(
      withReplicationFallback(replicaUnreadable, postgrest, 'entries', 'select_test')
    ).resolves.toEqual(SERVER_ROWS);
  });

  it('does not consult the queue for other replication throws', async () => {
    const postgrest = vi.fn(async () => SERVER_ROWS);

    await expect(
      withReplicationFallback(
        () => Promise.reject(new Error('cold store')),
        postgrest,
        'entries',
        'select_test'
      )
    ).resolves.toEqual(SERVER_ROWS);
    expect(pending).not.toHaveBeenCalled();
  });
});
