/**
 * Unit Tests for useNotificationPermissions Hook
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useNotificationPermissions } from './useNotificationPermissions';
import { vi } from 'vitest';

describe('useNotificationPermissions', () => {
  let mockNotification: {
    permission: NotificationPermission;
    requestPermission: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Mock Notification API
    mockNotification = {
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    };

    // @ts-expect-error - Mocking global Notification
    global.Notification = mockNotification;

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Browser support detection', () => {
    test('should detect when notifications are supported', () => {
      const { result } = renderHook(() => useNotificationPermissions());

      expect(result.current.isSupported).toBe(true);
      expect(result.current.permissionStatus.supported).toBe(true);
    });

    test('should detect when notifications are not supported', () => {
      // @ts-expect-error - Testing unsupported browser
      delete global.Notification;

      const { result } = renderHook(() => useNotificationPermissions());

      expect(result.current.isSupported).toBe(false);
      expect(result.current.permissionStatus.supported).toBe(false);
      expect(result.current.permissionStatus.permission).toBe('denied');
      expect(result.current.permissionStatus.canRequestPermission).toBe(false);
    });
  });

  describe('Initial permission state', () => {
    test('should initialize with default permission', () => {
      mockNotification.permission = 'default';

      const { result } = renderHook(() => useNotificationPermissions());

      expect(result.current.permissionStatus.permission).toBe('default');
      expect(result.current.isGranted).toBe(false);
      expect(result.current.isDenied).toBe(false);
      expect(result.current.canRequest).toBe(true);
    });

    test('should initialize with granted permission', () => {
      mockNotification.permission = 'granted';

      const { result } = renderHook(() => useNotificationPermissions());

      expect(result.current.permissionStatus.permission).toBe('granted');
      expect(result.current.isGranted).toBe(true);
      expect(result.current.isDenied).toBe(false);
      expect(result.current.canRequest).toBe(false);
    });

    test('should initialize with denied permission', () => {
      mockNotification.permission = 'denied';

      const { result } = renderHook(() => useNotificationPermissions());

      expect(result.current.permissionStatus.permission).toBe('denied');
      expect(result.current.isGranted).toBe(false);
      expect(result.current.isDenied).toBe(true);
      expect(result.current.canRequest).toBe(false);
    });
  });

  describe('Request permission', () => {
    test('should request permission successfully', async () => {
      // Use real timers for async operations
      vi.useRealTimers();

      mockNotification.permission = 'default';
      mockNotification.requestPermission.mockResolvedValue('granted');

      const { result } = renderHook(() => useNotificationPermissions());

      let permission: NotificationPermission | undefined;
      await act(async () => {
        permission = await result.current.requestPermission();
      });

      expect(permission).toBe('granted');
      expect(mockNotification.requestPermission).toHaveBeenCalled();
      expect(result.current.isGranted).toBe(true);

      vi.useFakeTimers();
    });

    test('should handle permission denial', async () => {
      // Use real timers for async operations
      vi.useRealTimers();

      mockNotification.permission = 'default';
      mockNotification.requestPermission.mockResolvedValue('denied');

      const { result } = renderHook(() => useNotificationPermissions());

      let permission: NotificationPermission | undefined;
      await act(async () => {
        permission = await result.current.requestPermission();
      });

      expect(permission).toBe('denied');
      expect(result.current.isDenied).toBe(true);

      vi.useFakeTimers();
    });

    test('should return granted if already granted', async () => {
      // Use real timers for async operations
      vi.useRealTimers();

      mockNotification.permission = 'granted';

      const { result } = renderHook(() => useNotificationPermissions());

      let permission: NotificationPermission | undefined;
      await act(async () => {
        permission = await result.current.requestPermission();
      });

      expect(permission).toBe('granted');
      expect(mockNotification.requestPermission).not.toHaveBeenCalled();

      vi.useFakeTimers();
    });

    test('should return denied if already denied', async () => {
      // Use real timers for async operations
      vi.useRealTimers();

      mockNotification.permission = 'denied';

      const { result } = renderHook(() => useNotificationPermissions());

      let permission: NotificationPermission | undefined;
      await act(async () => {
        permission = await result.current.requestPermission();
      });

      expect(permission).toBe('denied');
      expect(mockNotification.requestPermission).not.toHaveBeenCalled();

      vi.useFakeTimers();
    });

    test('should return denied if notifications not supported', async () => {
      // Use real timers for async operations
      vi.useRealTimers();

      // @ts-expect-error - Testing unsupported browser
      delete global.Notification;

      const { result } = renderHook(() => useNotificationPermissions());

      let permission: NotificationPermission | undefined;
      await act(async () => {
        permission = await result.current.requestPermission();
      });

      expect(permission).toBe('denied');

      vi.useFakeTimers();
    });

    test('should handle requestPermission errors', async () => {
      // Use real timers for async operations
      vi.useRealTimers();

      mockNotification.permission = 'default';
      mockNotification.requestPermission.mockRejectedValue(new Error('User denied'));

      const { result } = renderHook(() => useNotificationPermissions());

      let permission: NotificationPermission | undefined;
      await act(async () => {
        permission = await result.current.requestPermission();
      });

      expect(permission).toBe('denied');

      vi.useFakeTimers();
    });
  });

  describe('Permission change detection', () => {
    test.skip('should detect permission changes via polling', async () => {
      mockNotification.permission = 'default';

      const { result } = renderHook(() => useNotificationPermissions());

      expect(result.current.permissionStatus.permission).toBe('default');

      // Simulate user granting permission in browser settings
      mockNotification.permission = 'granted';

      // Fast-forward time to trigger polling interval
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve(); // Allow state updates to flush
      });

      expect(result.current.permissionStatus.permission).toBe('granted');
    });

    test('should not update if permission unchanged', () => {
      mockNotification.permission = 'granted';

      const { result } = renderHook(() => useNotificationPermissions());

      const initialStatus = result.current.permissionStatus;

      // Fast-forward time
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // Status object should be the same reference
      expect(result.current.permissionStatus).toBe(initialStatus);
    });
  });

  describe('onPermissionChange callback', () => {
    test('should call callback when permission granted', async () => {
      // Use real timers for async operations
      vi.useRealTimers();

      mockNotification.permission = 'default';
      mockNotification.requestPermission.mockResolvedValue('granted');
      const onPermissionChange = vi.fn();

      const { result } = renderHook(() =>
        useNotificationPermissions({ onPermissionChange })
      );

      await act(async () => {
        await result.current.requestPermission();
      });

      expect(onPermissionChange).toHaveBeenCalledWith('granted');

      vi.useFakeTimers();
    });

    test.skip('should call callback when permission changes via polling', async () => {
      mockNotification.permission = 'default';
      const onPermissionChange = vi.fn();

      renderHook(() =>
        useNotificationPermissions({ onPermissionChange })
      );

      // Clear initial call
      onPermissionChange.mockClear();

      // Simulate permission change
      mockNotification.permission = 'granted';

      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve(); // Allow state updates to flush
      });

      expect(onPermissionChange).toHaveBeenCalledWith('granted');
    });

    test('should not call callback if permission unchanged', () => {
      mockNotification.permission = 'granted';
      const onPermissionChange = vi.fn();

      renderHook(() =>
        useNotificationPermissions({ onPermissionChange })
      );

      // Clear any initial calls
      onPermissionChange.mockClear();

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(onPermissionChange).not.toHaveBeenCalled();
    });
  });

  describe('Convenience properties', () => {
    test('isGranted should be true when permission granted', () => {
      mockNotification.permission = 'granted';

      const { result } = renderHook(() => useNotificationPermissions());

      expect(result.current.isGranted).toBe(true);
      expect(result.current.isDenied).toBe(false);
      expect(result.current.canRequest).toBe(false);
    });

    test('isDenied should be true when permission denied', () => {
      mockNotification.permission = 'denied';

      const { result } = renderHook(() => useNotificationPermissions());

      expect(result.current.isGranted).toBe(false);
      expect(result.current.isDenied).toBe(true);
      expect(result.current.canRequest).toBe(false);
    });

    test('canRequest should be true when permission is default', () => {
      mockNotification.permission = 'default';

      const { result } = renderHook(() => useNotificationPermissions());

      expect(result.current.isGranted).toBe(false);
      expect(result.current.isDenied).toBe(false);
      expect(result.current.canRequest).toBe(true);
    });
  });

  describe('Real-world Settings.tsx workflow', () => {
    test('should handle notification enable workflow', async () => {
      // Use real timers for async operations
      vi.useRealTimers();

      mockNotification.permission = 'default';
      mockNotification.requestPermission.mockResolvedValue('granted');

      const { result } = renderHook(() => useNotificationPermissions());

      // User hasn't enabled notifications yet
      expect(result.current.canRequest).toBe(true);
      expect(result.current.isGranted).toBe(false);

      // User clicks "Enable Notifications"
      await act(async () => {
        await result.current.requestPermission();
      });

      // Permission granted
      expect(result.current.isGranted).toBe(true);
      expect(result.current.canRequest).toBe(false);

      vi.useFakeTimers();
    });

    test('should handle already granted permissions', () => {
      mockNotification.permission = 'granted';

      const { result } = renderHook(() => useNotificationPermissions());

      expect(result.current.isGranted).toBe(true);
      expect(result.current.canRequest).toBe(false);
    });

    test('should handle user denying permission', async () => {
      // Use real timers for async operations
      vi.useRealTimers();

      mockNotification.permission = 'default';
      mockNotification.requestPermission.mockResolvedValue('denied');

      const { result } = renderHook(() => useNotificationPermissions());

      await act(async () => {
        await result.current.requestPermission();
      });

      expect(result.current.isDenied).toBe(true);
      expect(result.current.canRequest).toBe(false);

      vi.useFakeTimers();
    });
  });

  describe('Edge cases', () => {
    test('should handle multiple rapid permission requests', async () => {
      // Use real timers for async operations
      vi.useRealTimers();

      mockNotification.permission = 'default';
      mockNotification.requestPermission.mockResolvedValue('granted');

      const { result } = renderHook(() => useNotificationPermissions());

      // Request multiple times rapidly
      const promises = [
        result.current.requestPermission(),
        result.current.requestPermission(),
        result.current.requestPermission(),
      ];

      await act(async () => {
        await Promise.all(promises);
      });

      // All should return granted
      const results = await Promise.all(promises);
      expect(results).toEqual(['granted', 'granted', 'granted']);

      vi.useFakeTimers();
    });

    test('should cleanup interval on unmount', () => {
      const { unmount } = renderHook(() => useNotificationPermissions());

      const timerCount = vi.getTimerCount();

      unmount();

      // Timer should be cleared
      expect(vi.getTimerCount()).toBeLessThan(timerCount);
    });
  });
});
