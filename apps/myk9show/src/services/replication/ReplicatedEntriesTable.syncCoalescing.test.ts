/**
 * ReplicatedEntriesTable shares one in-flight sync per principal and show, so
 * background replication and report reads do not fetch the same show twice. A
 * FORCED full sync (offline readiness prime, MYK9-752) must not be answered by
 * an incremental sync already running: it waits that one out, then runs its
 * own, which later callers share.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncResult } from '@myk9/replication';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

import { ReplicatedEntriesTable } from './ReplicatedEntriesTable';

type SyncShow = (
  showId: string,
  principalId: string,
  forceFullSync?: boolean
) => Promise<SyncResult>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const ok = (): SyncResult => ({
  tableName: 'entries',
  success: true,
  operation: 'incremental-sync',
  rowsAffected: 0,
  duration: 0,
});

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('ReplicatedEntriesTable sync coalescing', () => {
  let table: ReplicatedEntriesTable;
  let syncShow: ReturnType<typeof vi.fn<SyncShow>>;

  beforeEach(() => {
    table = new ReplicatedEntriesTable();
    syncShow = vi.fn<SyncShow>(async () => ok());
    (table as unknown as { syncShow: SyncShow }).syncShow = syncShow;
  });

  it('shares one incremental sync between concurrent callers', async () => {
    const first = deferred<SyncResult>();
    syncShow.mockReturnValueOnce(first.promise);
    const a = table.sync('show-1');
    const b = table.sync('show-1');
    first.resolve(ok());
    await Promise.all([a, b]);

    expect(syncShow).toHaveBeenCalledTimes(1);
    expect(syncShow).toHaveBeenCalledWith('show-1', 'anonymous', false);
  });

  it('a forced sync waits out the incremental one running, then runs its own', async () => {
    const first = deferred<SyncResult>();
    syncShow.mockReturnValueOnce(first.promise);
    const incremental = table.sync('show-1');
    const forced = table.sync('show-1', { forceFullSync: true });
    await flush();
    expect(syncShow).toHaveBeenCalledTimes(1);

    first.resolve(ok());
    await Promise.all([incremental, forced]);
    expect(syncShow).toHaveBeenCalledTimes(2);
    expect(syncShow).toHaveBeenLastCalledWith('show-1', 'anonymous', true);
  });

  it('a forced sync still runs when the one it waited out failed', async () => {
    const first = deferred<SyncResult>();
    syncShow.mockReturnValueOnce(first.promise);
    const incremental = table.sync('show-1').catch(() => undefined);
    const forced = table.sync('show-1', { forceFullSync: true });

    first.reject(new Error('Failed to fetch'));
    await Promise.all([incremental, forced]);
    expect(syncShow).toHaveBeenLastCalledWith('show-1', 'anonymous', true);
  });

  it('later ordinary callers share the forced run', async () => {
    const forcedRun = deferred<SyncResult>();
    syncShow.mockReturnValueOnce(forcedRun.promise);
    const forced = table.sync('show-1', { forceFullSync: true });
    await flush();
    const joined = table.sync('show-1');
    forcedRun.resolve(ok());
    await Promise.all([forced, joined]);

    expect(syncShow).toHaveBeenCalledTimes(1);
  });

  it('overlapping forced syncs share one full sync', async () => {
    const forcedRun = deferred<SyncResult>();
    syncShow.mockReturnValueOnce(forcedRun.promise);
    const first = table.sync('show-1', { forceFullSync: true });
    await flush();
    const second = table.sync('show-1', { forceFullSync: true });
    forcedRun.resolve(ok());
    await Promise.all([first, second]);

    expect(syncShow).toHaveBeenCalledTimes(1);
  });

  it('a new sync after the shared one finished contacts the server again', async () => {
    await table.sync('show-1');
    await table.sync('show-1');
    expect(syncShow).toHaveBeenCalledTimes(2);
  });
});
