import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onlineManager } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({ sync: vi.fn() }));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { sync: mocks.sync },
}));

import {
  refreshShowEntriesOnOpen,
  resetShowOpenRefreshesForTests,
} from './refreshShowEntriesForRead';

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

describe('refreshShowEntriesOnOpen (MYK9-1064)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T22:00:00Z'));
    mocks.sync.mockReset().mockResolvedValue({ success: true });
    resetShowOpenRefreshesForTests();
    onlineManager.setOnline(true);
    setVisibility('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
    onlineManager.setOnline(true);
    setVisibility('visible');
  });

  it('syncs the opened show once for concurrent opens', async () => {
    const [first, second] = await Promise.all([
      refreshShowEntriesOnOpen('show-1'),
      refreshShowEntriesOnOpen('show-1'),
    ]);

    expect([first, second]).toEqual([true, true]);
    expect(mocks.sync).toHaveBeenCalledTimes(1);
    expect(mocks.sync).toHaveBeenCalledWith('show-1');
  });

  it('syncs again once the gap has passed, and per show', async () => {
    await refreshShowEntriesOnOpen('show-1');
    await refreshShowEntriesOnOpen('show-2');
    vi.setSystemTime(new Date('2026-10-08T22:00:16Z'));
    await refreshShowEntriesOnOpen('show-1');

    expect(mocks.sync.mock.calls.map(call => call[0])).toEqual(['show-1', 'show-2', 'show-1']);
  });

  it('does not touch the network offline', async () => {
    onlineManager.setOnline(false);

    expect(await refreshShowEntriesOnOpen('show-1')).toBe(false);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it('retries at once after a failed refresh', async () => {
    mocks.sync.mockResolvedValueOnce({ success: false });

    expect(await refreshShowEntriesOnOpen('show-1')).toBe(false);
    expect(await refreshShowEntriesOnOpen('show-1')).toBe(true);
    expect(mocks.sync).toHaveBeenCalledTimes(2);
  });

  it('refreshes a show once per page session while the tab is hidden', async () => {
    setVisibility('hidden');
    await refreshShowEntriesOnOpen('show-1');
    vi.setSystemTime(new Date('2026-10-08T22:05:00Z'));

    expect(await refreshShowEntriesOnOpen('show-1')).toBe(false);
    expect(mocks.sync).toHaveBeenCalledTimes(1);
  });
});
