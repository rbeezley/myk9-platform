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
      /Can't read this device's saved changes/
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

  it('after 3 failed reads says so, keeps re-checking, and settles on a later success', async () => {
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
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(result.current).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(spy).toHaveBeenCalledTimes(3);
    expect(result.current).toBe('unreadable');

    // Still re-checking, still one read per interval.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(spy).toHaveBeenCalledTimes(4);
    expect(result.current).toBe('unreadable');

    fail = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(result.current).toBe('settled');
  });
});
