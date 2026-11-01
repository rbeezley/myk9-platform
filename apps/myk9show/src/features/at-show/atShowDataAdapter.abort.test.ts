/**
 * MYK9-1629: going offline aborts a `syncAtShowData` run like the replication
 * pass (MYK9-1624). Try again after reconnecting starts fresh, and the settled
 * listeners wait for the table syncs themselves.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { trialsSync, classesSync, entriesSync, armbandsSync } = vi.hoisted(() => ({
  trialsSync: vi.fn(async (..._args: unknown[]) => ({ success: true })),
  classesSync: vi.fn(async (..._args: unknown[]) => ({ success: true })),
  entriesSync: vi.fn(async (..._args: unknown[]) => ({ success: true })),
  armbandsSync: vi.fn(async (..._args: unknown[]) => ({ success: true })),
}));

vi.mock('@/services/replication', () => ({
  replicatedArmbandsTable: {
    getByShow: vi.fn(async () => []),
    sync: (...args: unknown[]) => armbandsSync(...args),
    subscribe: vi.fn(() => vi.fn()),
  },
  replicatedTrialsTable: {
    sync: (...args: unknown[]) => trialsSync(...args),
    getTrialsByShow: async () => [{ id: 'trial-1' }],
  },
  replicatedClassesTable: { sync: (...args: unknown[]) => classesSync(...args) },
  replicatedEntriesTable: { sync: (...args: unknown[]) => entriesSync(...args) },
}));

import { isAbortSyncError } from '@/services/replication/syncErrorUtils';
import { subscribeAtShowSyncSettled, syncAtShowData } from './atShowDataAdapter';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const goOffline = () => window.dispatchEvent(new Event('offline'));

function hung() {
  let resolve!: () => void;
  const promise = new Promise<{ success: boolean }>(res => {
    resolve = () => res({ success: true });
  });
  return { promise, resolve };
}

describe('syncAtShowData abort on offline', () => {
  beforeEach(() => {
    for (const mock of [trialsSync, classesSync, entriesSync, armbandsSync]) {
      mock.mockReset().mockImplementation(async () => ({ success: true }));
    }
  });

  it('rejects with an abort error and hands every table sync the aborting signal', async () => {
    const entries = hung();
    entriesSync.mockReturnValueOnce(entries.promise);
    const running = syncAtShowData('abort-a');
    const rejection = running.catch((error: unknown) => error);
    await flush();
    const signal = (entriesSync.mock.calls[0]?.[1] as { signal: AbortSignal }).signal;
    expect(signal.aborted).toBe(false);

    goOffline();

    expect(isAbortSyncError(await rejection)).toBe(true);
    expect(signal.aborted).toBe(true);
    expect((trialsSync.mock.calls[0]?.[1] as { signal: AbortSignal }).signal).toBe(signal);
    expect((classesSync.mock.calls[0]?.[1] as { signal: AbortSignal }).signal).toBe(signal);
    expect((armbandsSync.mock.calls[0]?.[1] as { signal: AbortSignal }).signal).toBe(signal);
    entries.resolve();
  });

  it('starts fresh after an abort instead of joining the hung run', async () => {
    const entries = hung();
    entriesSync.mockReturnValueOnce(entries.promise);
    const first = syncAtShowData('abort-b').catch(() => 'aborted');
    await flush();
    goOffline();
    expect(await first).toBe('aborted');

    const second = syncAtShowData('abort-b');
    await expect(second).resolves.toEqual({ success: true });
    expect(entriesSync).toHaveBeenCalledTimes(2);
    expect(trialsSync).toHaveBeenCalledTimes(2);
    entries.resolve();
  });

  it('fires settled listeners only when the underlying table sync finishes', async () => {
    const entries = hung();
    entriesSync.mockReturnValueOnce(entries.promise);
    const listener = vi.fn();
    const stop = subscribeAtShowSyncSettled('abort-c', listener);
    const rejection = syncAtShowData('abort-c').catch(() => 'aborted');
    await flush();

    goOffline();
    expect(await rejection).toBe('aborted');
    await flush();
    expect(listener).not.toHaveBeenCalled();

    entries.resolve();
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });

  it('starts no further table sync after the abort', async () => {
    const trials = hung();
    trialsSync.mockReturnValueOnce(trials.promise);
    const rejection = syncAtShowData('abort-d').catch(() => 'aborted');
    await flush();
    goOffline();
    expect(await rejection).toBe('aborted');

    trials.resolve();
    await flush();
    expect(classesSync).not.toHaveBeenCalled();
    expect(entriesSync).not.toHaveBeenCalled();
    expect(armbandsSync).not.toHaveBeenCalled();
  });

  it('a forced run queued behind an aborted run does not hang', async () => {
    const entries = hung();
    entriesSync.mockReturnValueOnce(entries.promise);
    const first = syncAtShowData('abort-e').catch(() => 'aborted');
    await flush();
    const forced = syncAtShowData('abort-e', { forceFullSync: true });
    goOffline();
    expect(await first).toBe('aborted');
    // The offline event aborts the queued forced run too; it ends, never hangs.
    await expect(forced).rejects.toThrow();
    const retry = await syncAtShowData('abort-e', { forceFullSync: true });
    expect(retry).toEqual({ success: true });
    entries.resolve();
  });
});
