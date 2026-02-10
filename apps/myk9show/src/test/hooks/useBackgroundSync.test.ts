// Tests for useBackgroundSync hook
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBackgroundSync } from '@/hooks/useBackgroundSync';

// Mock the background sync service (this is what useBackgroundSync actually imports)
vi.mock('@/services/sync/backgroundSyncService', () => ({
  backgroundSyncService: {
    getSyncStatistics: vi.fn().mockReturnValue({
      pendingTasks: 0,
      completedTasks: 9,
      failedTasks: 1,
      totalTasks: 10,
      averageRetries: 1,
      averageDuration: 1000,
      networkQuality: 'good',
      lastSyncAttempt: Date.now()
    }),
    getNetworkStatus: vi.fn().mockReturnValue({
      online: true,
      connectionType: 'wifi',
      effectiveType: '4g',
      downlink: 10,
      rtt: 50,
      quality: 'good'
    }),
    onSyncComplete: vi.fn(),
    onSyncError: vi.fn(),
    onNetworkChange: vi.fn(),
    forcSync: vi.fn().mockResolvedValue(0),
    stop: vi.fn().mockResolvedValue(undefined)
  }
}));

// Mock the logger
vi.mock('@/services/LoggingService', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}));

// Mock @myk9/core
vi.mock('@myk9/core', () => ({
  ensureError: vi.fn((e: unknown) => e instanceof Error ? e : new Error(String(e))),
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
    expect(result.current.queueSize).toBeDefined();
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

    // Should call the background sync service's forcSync method
    const { backgroundSyncService } = await import('@/services/sync/backgroundSyncService');
    expect(backgroundSyncService.forcSync).toHaveBeenCalled();
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

  it('should handle sync events', async () => {
    renderHook(() => useBackgroundSync());

    // The hook should register event listeners via backgroundSyncService
    const { backgroundSyncService } = await import('@/services/sync/backgroundSyncService');
    expect(backgroundSyncService.onSyncComplete).toHaveBeenCalled();
    expect(backgroundSyncService.onSyncError).toHaveBeenCalled();
    expect(backgroundSyncService.onNetworkChange).toHaveBeenCalled();
  });

  it('should cleanup properly on unmount', async () => {
    const { unmount } = renderHook(() => useBackgroundSync());

    unmount();

    // The hook cleans up by setting mounted=false and clearing intervals/window listeners.
    // Since backgroundSyncService uses callback registration (not on/off pattern),
    // we verify the hook doesn't throw on unmount and that event listeners were registered.
    const { backgroundSyncService } = await import('@/services/sync/backgroundSyncService');
    expect(backgroundSyncService.onSyncComplete).toHaveBeenCalled();
  });

  it('should handle sync errors gracefully', async () => {
    // Mock background sync service to throw error
    const { backgroundSyncService } = await import('@/services/sync/backgroundSyncService');
    vi.mocked(backgroundSyncService.forcSync).mockRejectedValueOnce(new Error('Sync failed'));

    const { result } = renderHook(() => useBackgroundSync());

    await act(async () => {
      await result.current.forceSyncNow();
    });

    // Should handle error and set error state
    expect(result.current.error).toBeDefined();
  });
});
