/**
 * MYK9-766: the at-show page hydrates its show through `syncAtShowData`, which
 * never touches the replication provider's `lastSyncAt`. The offline readiness
 * badge needs its own "that sync has settled" signal, fired only AFTER every
 * row of the operation is written, and on failure too (a partial sync still
 * changed local rows).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { trialsSync, classesSync, entriesSync } = vi.hoisted(() => ({
  trialsSync: vi.fn(async (..._args: unknown[]) => ({ success: true })),
  classesSync: vi.fn(async (..._args: unknown[]) => ({ success: true })),
  entriesSync: vi.fn(async (..._args: unknown[]) => ({ success: true })),
}));

vi.mock('@/services/replication', () => ({
  replicatedArmbandsTable: {
    getByShow: vi.fn(async () => []),
    sync: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  },
  replicatedTrialsTable: {
    sync: (...args: unknown[]) => trialsSync(...args),
    getTrialsByShow: async () => [{ id: 'trial-1' }],
  },
  replicatedClassesTable: { sync: (...args: unknown[]) => classesSync(...args) },
  replicatedEntriesTable: { sync: (...args: unknown[]) => entriesSync(...args) },
}));

import { replicatedArmbandsTable } from '@/services/replication';
import { subscribeAtShowSyncSettled, syncAtShowData } from './atShowDataAdapter';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<{ success: boolean }>(res => {
    resolve = () => res({ success: true });
  });
  return { promise, resolve };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('subscribeAtShowSyncSettled', () => {
  beforeEach(() => {
    trialsSync.mockClear();
    vi.mocked(replicatedArmbandsTable.sync).mockReset();
    classesSync.mockReset().mockImplementation(async () => ({ success: true }));
    entriesSync.mockReset().mockImplementation(async () => ({ success: true }));
  });

  it('fires for the show only after every scope of the sync has written', async () => {
    const entries = deferred();
    entriesSync.mockReturnValueOnce(entries.promise);
    const listener = vi.fn();
    const unsubscribe = subscribeAtShowSyncSettled('show-a', listener);

    const running = syncAtShowData('show-a');
    await flush();
    // Trials and classes are done, entries are still being written.
    expect(listener).not.toHaveBeenCalled();

    entries.resolve();
    await running;
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('fires when the sync fails part-way, and not for other shows', async () => {
    classesSync.mockRejectedValueOnce(new Error('network'));
    const listener = vi.fn();
    const other = vi.fn();
    const unsubscribe = subscribeAtShowSyncSettled('show-b', listener);
    const unsubscribeOther = subscribeAtShowSyncSettled('show-other', other);

    await expect(syncAtShowData('show-b')).rejects.toThrow('network');
    await flush();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    unsubscribe();
    unsubscribeOther();
  });

  // Codex P2: Promise.all rejects as soon as one scope fails, which fired the
  // signal while the entries scope was still writing, and nothing fired again.
  it('on a part-way failure, waits for every started scope before firing', async () => {
    const entries = deferred();
    entriesSync.mockReturnValueOnce(entries.promise);
    classesSync.mockRejectedValueOnce(new Error('network'));
    const listener = vi.fn();
    const unsubscribe = subscribeAtShowSyncSettled('show-d', listener);

    const running = syncAtShowData('show-d');
    const outcome = running.then(
      () => 'resolved',
      (error: Error) => error.message
    );
    await flush();
    // Classes already failed; entries are still being written.
    expect(listener).not.toHaveBeenCalled();

    entries.resolve();
    expect(await outcome).toBe('network');
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('waits for armbands even if another scope fails, then releases the readiness listener', async () => {
    const armbands = deferred();
    vi.mocked(replicatedArmbandsTable.sync).mockReturnValueOnce(armbands.promise as never);
    classesSync.mockRejectedValueOnce(new Error('network'));
    const listener = vi.fn();
    const stop = subscribeAtShowSyncSettled('show-armbands', listener);
    const outcome = syncAtShowData('show-armbands').then(
      () => 'resolved',
      () => 'failed'
    );
    await flush();
    expect(listener).not.toHaveBeenCalled();
    armbands.resolve();
    expect(await outcome).toBe('failed');
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });

  it('stops firing after unsubscribe', async () => {
    const listener = vi.fn();
    subscribeAtShowSyncSettled('show-c', listener)();

    await syncAtShowData('show-c');
    await flush();

    expect(listener).not.toHaveBeenCalled();
  });
});

/**
 * MYK9-1350: a caller that needs to know whether the show arrived (the cold
 * scoresheet) reads the operation's outcome. Replication reports a failed
 * scope as `{ success: false }`, not a rejection, so awaiting alone hid it.
 */
describe('syncAtShowData outcome', () => {
  beforeEach(() => {
    trialsSync.mockReset().mockImplementation(async () => ({ success: true }));
    classesSync.mockReset().mockImplementation(async () => ({ success: true }));
    entriesSync.mockReset().mockImplementation(async () => ({ success: true }));
    vi.mocked(replicatedArmbandsTable.sync)
      .mockReset()
      .mockResolvedValue({ success: true } as never);
  });

  it('reports success when every scope succeeds', async () => {
    await expect(syncAtShowData('show-outcome-ok')).resolves.toEqual({ success: true });
  });

  it.each([
    ['trials', trialsSync],
    ['classes', classesSync],
    ['entries', entriesSync],
  ])('reports failure when the %s scope resolves { success: false }', async (_scope, sync) => {
    sync.mockImplementation(async () => ({ success: false }));
    await expect(syncAtShowData('show-outcome-failed')).resolves.toEqual({ success: false });
  });

  it('reports failure when the armbands scope resolves { success: false }', async () => {
    vi.mocked(replicatedArmbandsTable.sync).mockResolvedValue({ success: false } as never);
    await expect(syncAtShowData('show-outcome-armbands')).resolves.toEqual({ success: false });
  });

  it('still rejects when a scope throws', async () => {
    entriesSync.mockRejectedValueOnce(new Error('network'));
    await expect(syncAtShowData('show-outcome-throws')).rejects.toThrow('network');
  });

  it('hands a joiner the same outcome as the starter', async () => {
    let finish!: () => void;
    entriesSync.mockReturnValueOnce(
      new Promise<{ success: boolean }>(resolve => {
        finish = () => resolve({ success: false });
      })
    );
    const starter = syncAtShowData('show-outcome-joined');
    const joiner = syncAtShowData('show-outcome-joined');
    await flush();
    finish();

    const [started, joined] = await Promise.all([starter, joiner]);
    expect(started).toEqual({ success: false });
    expect(joined).toBe(started);
    expect(trialsSync).toHaveBeenCalledTimes(1);
  });
});
