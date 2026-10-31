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

  describe('cancelled operations (MYK9-1624)', () => {
    it('a sync after an aborted one waits it out, then starts its own with its own signal', async () => {
      const first = deferred<SyncResult>();
      syncShow.mockReturnValueOnce(first.promise);
      const pass = new AbortController();
      const aborted = table.sync('show-1', { signal: pass.signal }).catch(() => undefined);
      await flush();

      pass.abort();
      const next = new AbortController();
      const retry = table.sync('show-1', { signal: next.signal });
      await flush();
      // Not joined, and not started while the cancelled one is still winding down.
      expect(syncShow).toHaveBeenCalledTimes(1);

      first.reject(new DOMException('Aborted', 'AbortError'));
      await Promise.all([aborted, retry]);
      expect(syncShow).toHaveBeenCalledTimes(2);
      expect(syncShow).toHaveBeenLastCalledWith('show-1', 'anonymous', false, next.signal);
    });

    it('a signal-less caller does not join an aborted operation either', async () => {
      const first = deferred<SyncResult>();
      syncShow.mockReturnValueOnce(first.promise);
      const pass = new AbortController();
      const aborted = table.sync('show-1', { signal: pass.signal }).catch(() => undefined);
      await flush();
      pass.abort();
      const retry = table.sync('show-1');
      first.resolve(ok());
      await Promise.all([aborted, retry]);
      expect(syncShow).toHaveBeenCalledTimes(2);
    });

    it('a signal-less joiner of a pass operation that then aborts gets a real sync, not the cancellation', async () => {
      const first = deferred<SyncResult>();
      syncShow.mockReturnValueOnce(first.promise);
      const pass = new AbortController();
      const owner = table.sync('show-1', { signal: pass.signal }).catch(() => undefined);
      await flush();
      const report = table.sync('show-1');

      pass.abort();
      first.resolve({ ...ok(), success: false, error: 'AbortError: the sync was cancelled' });
      await owner;

      await expect(report).resolves.toMatchObject({ success: true });
      expect(syncShow).toHaveBeenCalledTimes(2);
      expect(syncShow).toHaveBeenLastCalledWith('show-1', 'anonymous', false);
    });

    it('a forced signal-less joiner keeps its full sync when the operation it joined aborts', async () => {
      const first = deferred<SyncResult>();
      syncShow.mockReturnValueOnce(first.promise);
      const pass = new AbortController();
      const owner = table
        .sync('show-1', { forceFullSync: true, signal: pass.signal })
        .catch(() => undefined);
      await flush();
      const prime = table.sync('show-1', { forceFullSync: true });

      pass.abort();
      first.reject(new DOMException('Aborted', 'AbortError'));
      await owner;

      await expect(prime).resolves.toMatchObject({ success: true });
      expect(syncShow).toHaveBeenLastCalledWith('show-1', 'anonymous', true);
    });

    it('a caller joining a live operation stops waiting when its own signal aborts', async () => {
      const first = deferred<SyncResult>();
      syncShow.mockReturnValueOnce(first.promise);
      const running = table.sync('show-1');
      const pass = new AbortController();
      const joined = table.sync('show-1', { signal: pass.signal });
      const outcome = joined.then(
        () => 'settled',
        () => 'rejected'
      );

      pass.abort();
      expect(await outcome).toBe('rejected');
      expect(syncShow).toHaveBeenCalledTimes(1);

      first.resolve(ok());
      await running;
    });
  });

  describe('whenShowSyncSettles (MYK9-1130)', () => {
    it('is null with no sync of the show running, and starts none', async () => {
      expect(table.whenShowSyncSettles('show-1')).toBeNull();
      await table.sync('show-1');
      expect(table.whenShowSyncSettles('show-1')).toBeNull();
      expect(syncShow).toHaveBeenCalledTimes(1);
    });

    it("settles with the running sync of that show, any principal's, and not another show's", async () => {
      const mine = deferred<SyncResult>();
      const other = deferred<SyncResult>();
      syncShow.mockReturnValueOnce(mine.promise).mockReturnValueOnce(other.promise);
      const running = table.syncForPrincipal('show-1', 'user-1').catch(() => undefined);
      void table.sync('show-2');

      const settled = vi.fn();
      void table.whenShowSyncSettles('show-1')?.then(settled);
      await flush();
      expect(settled).not.toHaveBeenCalled();

      mine.reject(new Error('Failed to fetch'));
      await running;
      await flush();
      expect(settled).toHaveBeenCalledOnce();
      expect(table.whenShowSyncSettles('show-1')).toBeNull();
      expect(table.whenShowSyncSettles('show-2')).not.toBeNull();
      expect(syncShow).toHaveBeenCalledTimes(2);
      other.resolve(ok());
    });
  });
});
