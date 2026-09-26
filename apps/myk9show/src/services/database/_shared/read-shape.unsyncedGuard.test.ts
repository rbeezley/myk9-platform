import { describe, expect, it, vi } from 'vitest';
import { readWithReplicationFallback, UNSYNCED_UNREADABLE_MESSAGE } from './read-shape';

const failingReplica = () =>
  Promise.reject(new Error("This device couldn't read its saved show data. Try again."));
const SERVER_ROWS = [{ id: 'server-row' }];

function read(hasUnsyncedWrites?: () => Promise<boolean>) {
  const postgrest = vi.fn(async () => ({ data: SERVER_ROWS, error: null }));
  const result = readWithReplicationFallback<{ id: string }[]>({
    replication: failingReplica,
    postgrest,
    table: 'entries',
    operation: 'select_test',
    errorData: [],
    hasUnsyncedWrites,
  });
  return { postgrest, result };
}

/**
 * MYK9-774: a primary read whose replica is unreadable falls back to the
 * server. That server list shows any write this device has not uploaded as
 * undone, so a guarded read checks for such writes first.
 */
describe('readWithReplicationFallback — unreadable replica, unsynced writes', () => {
  it('returns the error, not the server list, when a local write may not have uploaded', async () => {
    const { postgrest, result } = read(async () => true);

    await expect(result).resolves.toMatchObject({
      data: [],
      error: expect.objectContaining({ message: UNSYNCED_UNREADABLE_MESSAGE }),
    });
    expect(postgrest).not.toHaveBeenCalled();
  });

  it('serves the server list when nothing is waiting to upload', async () => {
    const { postgrest, result } = read(async () => false);

    await expect(result).resolves.toEqual({ data: SERVER_ROWS, error: null });
    expect(postgrest).toHaveBeenCalledTimes(1);
  });

  it('keeps the unguarded behavior for reads that do not opt in', async () => {
    const { result } = read();

    await expect(result).resolves.toEqual({ data: SERVER_ROWS, error: null });
  });
});
