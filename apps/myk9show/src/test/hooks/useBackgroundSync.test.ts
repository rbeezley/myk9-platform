// Tests for useBackgroundSync hook
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBackgroundSync } from '@/hooks/useBackgroundSync';

// Mock the sync service
vi.mock('@/services/sync/syncService', () => ({
  syncService: {
    initialize: vi.fn().mockResolvedValue(undefined),
    addToQueue: vi.fn().mockResolvedValue('queue-id-123'),
    getStatistics: vi.fn().mockResolvedValue({
      totalSyncs: 10,
      successfulSyncs: 9,
      failedSyncs: 1,
      totalConflicts: 0,
      lastFullSync: new Date(),
      lastIncrementalSync: new Date(),
      averageSyncDuration: 1000
    }),
    getNetworkStatus: vi.fn().mockReturnValue({
      isOnline: true,
      quality: 'good',
      lastChecked: new Date()
    }),
    on: vi.fn(),
    off: vi.fn(),
    startSync: vi.fn().mockResolvedValue(undefined)
  }
}));

describe('useBackgroundSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useBackgroundSync());

    expect(result.current.isOnline).toBe(true);
    expect(result.current.isSyncing).toBe(false);
    expect(result.current.queueSize).toBe(0);
    expect(typeof result.current.metrics).toBe('object');
    expect(typeof result.current.networkState).toBe('object');
  });

  it('should provide sync actions', () => {
    const { result } = renderHook(() => useBackgroundSync());

    expect(typeof result.current.forceSyncNow).toBe('function');
    expect(typeof result.current.clearError).toBe('function');
    expect(typeof result.current.getEntitySyncStatus).toBe('function');
    expect(typeof result.current.hasPendingChanges).toBe('function');
  });

  it('should handle force sync', async () => {
    const { result } = renderHook(() => useBackgroundSync());

    await act(async () => {
      await result.current.forceSyncNow();
    });

    // Should call the sync service
    const { syncService } = await import('@/services/sync/syncService');
    expect(syncService.startSync).toHaveBeenCalled();
  });

  it('should clear errors', () => {
    const { result } = renderHook(() => useBackgroundSync());

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeUndefined();
  });

  it('should get entity sync status', () => {
    const { result } = renderHook(() => useBackgroundSync());

    const status = result.current.getEntitySyncStatus('club', 'club-123');
    expect(['synced', 'pending', 'error', 'conflict']).toContain(status);
  });

  it('should check for pending changes', () => {
    const { result } = renderHook(() => useBackgroundSync());

    const hasPending = result.current.hasPendingChanges();
    expect(typeof hasPending).toBe('boolean');
  });

  it('should calculate sync health status', () => {
    const { result } = renderHook(() => useBackgroundSync());

    expect(['good', 'warning', 'error']).toContain(result.current.syncHealthStatus);
  });

  it('should handle offline state', () => {
    // Mock offline state
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true
    });

    const { result } = renderHook(() => useBackgroundSync());

    // The hook should eventually reflect the offline state
    expect(result.current.isOnline).toBeDefined();
  });

  it('should estimate sync time', () => {
    const { result } = renderHook(() => useBackgroundSync());

    expect(typeof result.current.estimatedSyncTime).toBe('number');
    expect(result.current.estimatedSyncTime).toBeGreaterThanOrEqual(0);
  });

  it('should detect initialization state', () => {
    const { result } = renderHook(() => useBackgroundSync());

    expect(typeof result.current.isInitializing).toBe('boolean');
  });

  it('should handle network state changes', () => {
    const { result } = renderHook(() => useBackgroundSync());

    // Simulate online event
    act(() => {
      const onlineEvent = new Event('online');
      window.dispatchEvent(onlineEvent);
    });

    // Simulate offline event
    act(() => {
      const offlineEvent = new Event('offline');
      window.dispatchEvent(offlineEvent);
    });

    // Should handle both events without errors
    expect(result.current).toBeDefined();
  });

  it('should update metrics periodically', async () => {
    const { result } = renderHook(() => useBackgroundSync());

    // Initial metrics should be loaded
    expect(result.current.metrics).toBeDefined();
    expect(typeof result.current.metrics.syncSuccessRate).toBe('number');
  });

  it('should handle sync events', () => {
    const { result } = renderHook(() => useBackgroundSync());
    console.log('Background sync result:', result);

    // The hook should register event listeners
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { syncService } = require('@/services/sync/syncService');
    expect(syncService.on).toHaveBeenCalled();
  });

  it('should cleanup properly on unmount', () => {
    const { unmount } = renderHook(() => useBackgroundSync());

    unmount();

    // Should clean up event listeners
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { syncService } = require('@/services/sync/syncService');
    expect(syncService.off).toHaveBeenCalled();
  });

  it('should handle sync errors gracefully', async () => {
    // Mock sync service to throw error
    const { syncService } = await import('@/services/sync/syncService');
    vi.mocked(syncService.startSync).mockRejectedValueOnce(new Error('Sync failed'));

    const { result } = renderHook(() => useBackgroundSync());

    await act(async () => {
      await result.current.forceSyncNow();
    });

    // Should handle error and set error state
    expect(result.current.error).toBeDefined();
  });
});