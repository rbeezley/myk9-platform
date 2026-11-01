import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ABORTED_SYNC_MESSAGE } from '@myk9/replication';
import { useAtShowClassRefresh } from './useAtShowClassRefresh';

const mockSyncAtShowData = vi.hoisted(() => vi.fn());

vi.mock('./atShowDataAdapter', () => ({
  syncAtShowData: mockSyncAtShowData,
}));

describe('useAtShowClassRefresh', () => {
  beforeEach(() => {
    mockSyncAtShowData.mockReset();
  });

  it('answers offline, not failed, when going offline aborts the refresh (MYK9-1629)', async () => {
    mockSyncAtShowData.mockRejectedValue(new Error(ABORTED_SYNC_MESSAGE));
    const { result } = renderHook(() => useAtShowClassRefresh('show-1', true, vi.fn()));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.phase).toBe('offline');
  });

  it('still answers failed for any other sync error', async () => {
    mockSyncAtShowData.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useAtShowClassRefresh('show-1', true, vi.fn()));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.phase).toBe('failed');
  });
});
