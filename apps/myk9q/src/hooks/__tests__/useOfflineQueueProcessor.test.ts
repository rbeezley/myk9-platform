/**
 * Tests for useOfflineQueueProcessor — focused on the retry path that the
 * PR #341 review flagged: an item that fails its first retry must eventually
 * be retried (not stranded), and only after maxRetries failures should it
 * land in failedItems.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useOfflineQueueProcessor } from '../useOfflineQueueProcessor';
import { useOfflineQueueStore } from '@/stores/offlineQueueStore';
import * as entryService from '@/services/entryService';
import {
  baseScore,
  resetOfflineQueueStore,
} from '@/stores/__tests__/offlineQueueTestUtils';

vi.mock('@/services/entryService', () => ({
  submitScore: vi.fn(),
}));

vi.mock('@/services/replication/MutationQueueManager', () => ({
  mutationQueue: {
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getAll: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@myk9/scoring-ui', () => ({
  haptic: {
    light: vi.fn(),
    success: vi.fn(),
  },
}));

describe('useOfflineQueueProcessor — retry behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetOfflineQueueStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries a failed submitScore after backoff and eventually completes', async () => {
    const submitSpy = vi.mocked(entryService.submitScore);
    // Fail, fail, succeed
    submitSpy
      .mockRejectedValueOnce(new Error('transient 1'))
      .mockRejectedValueOnce(new Error('transient 2'))
      .mockResolvedValueOnce(true as unknown as void);

    const { unmount } = renderHook(() => useOfflineQueueProcessor());

    // Seed the queue (triggers the processor effect)
    await act(async () => {
      await useOfflineQueueStore.getState().addToQueue(baseScore);
    });

    // First attempt fires immediately and rejects. After markAsFailed,
    // the item stays pending with retryAt ~1s out. The scheduler in the
    // processor sets a setTimeout for that delay.
    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1), {
      timeout: 1000,
    });

    // Second attempt fires after ~1s backoff
    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(2), {
      timeout: 2000,
    });

    // Third attempt fires after ~2s backoff and succeeds
    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(3), {
      timeout: 3000,
    });

    // Item drained from both queue and failedItems on success
    await waitFor(() => {
      expect(useOfflineQueueStore.getState().queue).toHaveLength(0);
      expect(useOfflineQueueStore.getState().failedItems).toHaveLength(0);
    });

    unmount();
  }, 15000);

  it('moves item to failedItems after maxRetries (3) consecutive failures', async () => {
    const submitSpy = vi.mocked(entryService.submitScore);
    submitSpy.mockRejectedValue(new Error('persistent failure'));

    const { unmount } = renderHook(() => useOfflineQueueProcessor());

    await act(async () => {
      await useOfflineQueueStore.getState().addToQueue(baseScore);
    });

    // Wait for the third submit attempt (maxRetries=3 → three calls total
    // before the item is parked in failedItems). Backoffs are 1s, 2s.
    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(3), {
      timeout: 6000,
    });

    await waitFor(() => {
      expect(useOfflineQueueStore.getState().queue).toHaveLength(0);
      expect(useOfflineQueueStore.getState().failedItems).toHaveLength(1);
    });

    const failed = useOfflineQueueStore.getState().failedItems[0];
    expect(failed.status).toBe('failed');
    expect(failed.retryCount).toBe(3);
    expect(failed.lastError).toBe('persistent failure');

    unmount();
  }, 15000);

  it('does not burn retry budget while offline — bails the drain', async () => {
    const submitSpy = vi.mocked(entryService.submitScore);
    submitSpy.mockRejectedValue(new Error('would-be transient'));

    const { unmount } = renderHook(() => useOfflineQueueProcessor());

    // First attempt fires online, fails, schedules backoff.
    await act(async () => {
      await useOfflineQueueStore.getState().addToQueue(baseScore);
    });
    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1), {
      timeout: 1000,
    });

    // User goes offline mid-backoff.
    act(() => {
      useOfflineQueueStore.setState({ isOnline: false });
    });

    // Wait past the 1s backoff window. If the offline-bail guard is
    // missing, submitScore fires a second time and consumes retry budget.
    await new Promise(resolve => setTimeout(resolve, 1500));

    expect(submitSpy).toHaveBeenCalledTimes(1);
    // Item is still around with retryCount=1 (from the first failure),
    // ready to resume when isOnline flips back to true.
    expect(useOfflineQueueStore.getState().queue).toHaveLength(1);
    expect(useOfflineQueueStore.getState().queue[0].retryCount).toBe(1);
    expect(useOfflineQueueStore.getState().failedItems).toHaveLength(0);

    unmount();
  }, 10000);
});
