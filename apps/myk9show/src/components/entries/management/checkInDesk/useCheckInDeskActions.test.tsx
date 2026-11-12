import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCheckInDeskActions } from './useCheckInDeskActions';

const h = vi.hoisted(() => ({ updateReplicatedCheckInStatus: vi.fn() }));

vi.mock('@/services/show-day/checkInStatus', () => ({
  updateReplicatedCheckInStatus: h.updateReplicatedCheckInStatus,
}));

describe('a status write never waits for the entries re-read (MYK9-1812)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.updateReplicatedCheckInStatus.mockResolvedValue(null);
  });

  it('frees the entry once the write is stored, though the re-read never settles', async () => {
    const onRefreshEntries = vi.fn(() => new Promise<void>(() => {}));
    const { result } = renderHook(() => useCheckInDeskActions(onRefreshEntries));

    await act(async () => {
      await result.current.setStatus('Moss', ['e-1'], 'checked-in');
    });

    expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledWith('e-1', 'checked-in');
    expect(onRefreshEntries).toHaveBeenCalledTimes(1);
    expect(result.current.busyIds.has('e-1')).toBe(false);
    expect(result.current.notice).toBe('Checked in 1 class for Moss.');
  });

  it('asks for a fresh re-read after each write, so the last read follows the last write', async () => {
    const onRefreshEntries = vi.fn(() => new Promise<void>(() => {}));
    const { result } = renderHook(() => useCheckInDeskActions(onRefreshEntries));

    await act(async () => {
      await result.current.setStatus('Moss', ['e-1'], 'checked-in');
      await result.current.setStatus('Moss', ['e-1'], 'conflict');
    });

    expect(h.updateReplicatedCheckInStatus.mock.calls).toEqual([
      ['e-1', 'checked-in'],
      ['e-1', 'conflict'],
    ]);
    expect(onRefreshEntries).toHaveBeenCalledTimes(2);
    expect(h.updateReplicatedCheckInStatus.mock.invocationCallOrder[1]).toBeLessThan(
      onRefreshEntries.mock.invocationCallOrder[1]!
    );
  });

  it('is unaffected by a re-read that fails, and does not re-read a write that failed', async () => {
    const onRefreshEntries = vi.fn().mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useCheckInDeskActions(onRefreshEntries));

    await act(async () => {
      await result.current.setStatus('Moss', ['e-1'], 'checked-in');
    });
    expect(result.current.error).toBeNull();

    h.updateReplicatedCheckInStatus.mockRejectedValue(new Error('boom'));
    await act(async () => {
      await result.current.setStatus('Moss', ['e-2'], 'checked-in');
    });
    expect(result.current.error).toBe("Couldn't check in Moss. Try again.");
    expect(onRefreshEntries).toHaveBeenCalledTimes(1);
  });
});
