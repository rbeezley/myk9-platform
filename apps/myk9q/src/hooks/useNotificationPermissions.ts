/**
 * useNotificationPermissions Hook
 *
 * Manages notification permission state and browser compatibility checks.
 * Extracts ~50 lines of permission logic from notificationService.ts and Settings.tsx.
 *
 * Features:
 * - Check notification support in browser
 * - Get current permission status
 * - Request notification permission from user
 * - Track permission state changes
 * - Check if permission can be requested
 *
 * Dependencies: None (uses browser Notification API)
 */

import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/utils/logger';

export interface NotificationPermissionStatus {
  /**
   * Current notification permission ('granted', 'denied', 'default')
   */
  permission: NotificationPermission;

  /**
   * Whether notifications are supported in this browser
   */
  supported: boolean;

  /**
   * Whether permission can be requested (not granted or denied yet)
   */
  canRequestPermission: boolean;
}

export interface UseNotificationPermissionsOptions {
  /**
   * Optional callback when permission changes
   */
  onPermissionChange?: (permission: NotificationPermission) => void;
}

export interface UseNotificationPermissionsReturn {
  /**
   * Current notification permission status
   */
  permissionStatus: NotificationPermissionStatus;

  /**
   * Request notification permission from user
   */
  requestPermission: () => Promise<NotificationPermission>;

  /**
   * Check if notifications are supported
   */
  isSupported: boolean;

  /**
   * Check if permission is granted
   */
  isGranted: boolean;

  /**
   * Check if permission is denied
   */
  isDenied: boolean;

  /**
   * Check if permission can be requested
   */
  canRequest: boolean;
}

/**
 * Custom hook for managing notification permissions
 *
 * Consolidates permission logic from notificationService.ts (lines 133-169)
 * and Settings.tsx permission checks.
 *
 * @param options - Configuration options
 * @returns Permission state and methods
 *
 * @example
 * ```typescript
 * const {
 *   permissionStatus,
 *   requestPermission,
 *   isSupported,
 *   isGranted,
 *   canRequest
 * } = useNotificationPermissions();
 *
 * // Check if supported
 * if (!isSupported) {
 *   return <div>Notifications not supported</div>;
 * }
 *
 * // Request permission
 * if (canRequest) {
 *   await requestPermission();
 * }
 * ```
 */
export function useNotificationPermissions(
  options: UseNotificationPermissionsOptions = {}
): UseNotificationPermissionsReturn {
  const { onPermissionChange } = options;

  // Check if Notification API is supported
  const isSupported = 'Notification' in window;

  // Get current permission status
  const getPermissionStatus = useCallback((): NotificationPermissionStatus => {
    if (!isSupported) {
      return {
        permission: 'denied',
        supported: false,
        canRequestPermission: false,
      };
    }

    const permission = Notification.permission;
    return {
      permission,
      supported: true,
      canRequestPermission: permission === 'default',
    };
  }, [isSupported]);

  const [permissionStatus, setPermissionStatus] = useState<NotificationPermissionStatus>(
    getPermissionStatus
  );

  // Update permission status when it changes
  useEffect(() => {
    if (!isSupported) return;

    // Check permission status on mount and set up interval to detect changes
    const updateStatus = () => {
      const newStatus = getPermissionStatus();
      setPermissionStatus((prev) => {
        // Only update if permission actually changed
        if (prev.permission !== newStatus.permission) {
          if (onPermissionChange) {
            onPermissionChange(newStatus.permission);
          }
          return newStatus;
        }
        return prev;
      });
    };

    // Check immediately
    updateStatus();

    // Check periodically for permission changes (e.g., user changes in browser settings)
    // 30 second interval is sufficient - permission changes are rare (battery optimization)
    const interval = setInterval(updateStatus, 30000);

    return () => clearInterval(interval);
  }, [isSupported, getPermissionStatus, onPermissionChange]);

  // Request notification permission
  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (!isSupported) {
      logger.warn('Notifications not supported in this browser');
      return 'denied';
    }

    const currentPermission = Notification.permission;

    // If already granted or denied, return current state
    if (currentPermission === 'granted') {
      return 'granted';
    }

    if (currentPermission === 'denied') {
      logger.warn('Notification permission already denied');
      return 'denied';
    }

    // Request permission
    try {
      const permission = await Notification.requestPermission();
// Update state immediately
      setPermissionStatus({
        permission,
        supported: true,
        canRequestPermission: permission === 'default',
      });

      if (onPermissionChange) {
        onPermissionChange(permission);
      }

      return permission;
    } catch (error) {
      logger.error('Error requesting notification permission:', error);
      return 'denied';
    }
  }, [isSupported, onPermissionChange]);

  // Computed properties for convenience
  const isGranted = permissionStatus.permission === 'granted';
  const isDenied = permissionStatus.permission === 'denied';
  const canRequest = permissionStatus.canRequestPermission;

  return {
    permissionStatus,
    requestPermission,
    isSupported,
    isGranted,
    isDenied,
    canRequest,
  };
}
