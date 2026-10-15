import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { replicatedClassesTable } from '@/services/replication';
import { classRowSyncBlockedReason, useClassRowSyncState } from './useClassRowSyncState';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('classRowSyncBlockedReason', () => {
  it('treats an unknown state as pending, not settled', () => {
    expect(classRowSyncBlockedReason(null)).toBe('Checking this class…');
  });

  it('says honestly when the queue cannot be read', () => {
    expect(classRowSyncBlockedReason('unreadable')).toMatch(
      /Still checking this class. If this message stays, reload the page./
    );
  });

  it('is clear only when the class is known to be settled', () => {
    expect(classRowSyncBlockedReason('settled')).toBeNull();
    expect(classRowSyncBlockedReason('waiting')).toMatch(/Waiting for this class/);
    expect(classRowSyncBlockedReason('conflict')).toMatch(/changed elsewhere/);
  });
});

describe('useClassRowSyncState', () => {
  it('is unknown synchronously on first render, then settles', async () => {
    const { result } = renderHook(() => useClassRowSyncState('class-a'));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe('settled'));
  });

  it('is unknown again after a class switch until the new class reads', async () => {
    const { result, rerender } = renderHook(({ id }) => useClassRowSyncState(id), {
      initialProps: { id: 'class-a' },
    });
    await waitFor(() => expect(result.current).toBe('settled'));
    rerender({ id: 'class-b' });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe('settled'));
  });

  it('ignores a stale read from the previous class landing after a switch', async () => {
    let releaseA!: () => void;
    const spy = vi.spyOn(replicatedClassesTable, 'getReplicatedRow');
    spy.mockImplementation(async id => {
      if (id === 'class-a') await new Promise<void>(resolve => (releaseA = resolve));
      return null;
    });
    vi.spyOn(replicatedClassesTable, 'hasUnsyncedLocalWork').mockImplementation(
      async id => id === 'class-a'
    );
    const { result, rerender } = renderHook(({ id }) => useClassRowSyncState(id), {
      initialProps: { id: 'class-a' },
    });
    rerender({ id: 'class-b' });
    await waitFor(() => expect(result.current).toBe('settled'));
    await act(async () => releaseA());
    expect(result.current).toBe('settled');
  });

  it('stays unknown on a failed read and re-checks on a timer instead of spinning', async () => {
    vi.useFakeTimers();
    let fail = true;
    const spy = vi
      .spyOn(replicatedClassesTable, 'getReplicatedRow')
      .mockImplementation(async () => {
        if (fail) throw new Error('queue unreadable');
        return null;
      });
    vi.spyOn(replicatedClassesTable, 'hasUnsyncedLocalWork').mockResolvedValue(false);
    const { result } = renderHook(() => useClassRowSyncState('class-a'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);

    // Still failing: one re-check per interval, never a hot loop.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(result.current).toBeNull();
    expect(spy).toHaveBeenCalledTimes(2);

    fail = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(result.current).toBe('settled');
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('after 5s of failed reads says so, keeps re-checking, and settles on a later success', async () => {
    vi.useFakeTimers();
    let fail = true;
    const spy = vi
      .spyOn(replicatedClassesTable, 'getReplicatedRow')
      .mockImplementation(async () => {
        if (fail) throw new Error('indexeddb unavailable');
        return null;
      });
    vi.spyOn(replicatedClassesTable, 'hasUnsyncedLocalWork').mockResolvedValue(false);
    const { result } = renderHook(() => useClassRowSyncState('class-a'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_500);
    });
    expect(result.current).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(result.current).toBe('unreadable');

    // Still re-checking, still one read per interval.
    const before = spy.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(spy).toHaveBeenCalledTimes(before + 1);
    expect(result.current).toBe('unreadable');

    fail = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(result.current).toBe('settled');
  });

  it('a read that never settles reaches the reload copy by time, with exactly one read', async () => {
    vi.useFakeTimers();
    const spy = vi
      .spyOn(replicatedClassesTable, 'getReplicatedRow')
      .mockImplementation(() => new Promise(() => {}));
    vi.spyOn(replicatedClassesTable, 'hasUnsyncedLocalWork').mockResolvedValue(false);
    const { result } = renderHook(() => useClassRowSyncState('class-a'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_500);
    });
    expect(result.current).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(result.current).toBe('unreadable');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(result.current).toBe('unreadable');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a hung read that later succeeds clears the reload copy and settles', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    vi.spyOn(replicatedClassesTable, 'getReplicatedRow').mockImplementation(async () => {
      await new Promise<void>(resolve => (release = resolve));
      return null;
    });
    vi.spyOn(replicatedClassesTable, 'hasUnsyncedLocalWork').mockResolvedValue(false);
    const { result } = renderHook(() => useClassRowSyncState('class-a'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_100);
    });
    expect(result.current).toBe('unreadable');
    await act(async () => release());
    expect(result.current).toBe('settled');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(result.current).toBe('settled');
  });

  it('switching class resets the clock', async () => {
    vi.useFakeTimers();
    vi.spyOn(replicatedClassesTable, 'getReplicatedRow').mockImplementation(
      () => new Promise(() => {})
    );
    const { result, rerender } = renderHook(({ id }) => useClassRowSyncState(id), {
      initialProps: { id: 'class-a' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    rerender({ id: 'class-b' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(result.current).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_100);
    });
    expect(result.current).toBe('unreadable');
    rerender({ id: 'class-a' });
    expect(result.current).toBeNull();
  });

  it('a waiting class still re-checks every 1.5s and never escalates', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(replicatedClassesTable, 'getReplicatedRow').mockResolvedValue(null);
    vi.spyOn(replicatedClassesTable, 'hasUnsyncedLocalWork').mockResolvedValue(true);
    const { result } = renderHook(() => useClassRowSyncState('class-a'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current).toBe('waiting');
    // One interval per act: effects re-arm the timer only once the act flushes.
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_500);
      });
    }
    expect(result.current).toBe('waiting');
    expect(spy).toHaveBeenCalledTimes(7);
  });

  it('a read that settles after unmount sets no state (MYK9-1203)', async () => {
    let settle: (value: null) => void = () => {};
    vi.spyOn(replicatedClassesTable, 'getReplicatedRow').mockImplementation(
      () =>
        new Promise(resolve => {
          settle = resolve;
        })
    );
    vi.spyOn(replicatedClassesTable, 'hasUnsyncedLocalWork').mockResolvedValue(false);
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => {
      rejections.push(reason);
    };
    process.on('unhandledRejection', onRejection);
    try {
      const { unmount } = renderHook(() => useClassRowSyncState('class-a'));
      await waitFor(() => expect(replicatedClassesTable.getReplicatedRow).toHaveBeenCalled());
      unmount();

      // CI tears jsdom down before a late read settles; any setState then throws.
      vi.stubGlobal('window', undefined);
      settle(null);
      await new Promise(resolve => setTimeout(resolve, 0));
      await new Promise(resolve => setTimeout(resolve, 0));
    } finally {
      vi.unstubAllGlobals();
      process.off('unhandledRejection', onRejection);
    }
    expect(rejections).toEqual([]);
  });
});
