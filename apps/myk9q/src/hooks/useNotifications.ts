/**
 * useNotifications Hook
 *
 * React hook for managing notifications in components.
 * Provides methods to request permission, send notifications, and manage DND/quiet hours.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { notificationService, type NotificationPayload, type NotificationPermissionStatus, type QuietHoursConfig, type DoNotDisturbConfig } from '@/services/notificationService';
import * as handlers from '@/services/notificationHandlers';

export interface UseNotificationsReturn {
  // Permission status
  permissionStatus: NotificationPermissionStatus;
  requestPermission: () => Promise<NotificationPermission>;

  // Send notifications
  send: (payload: NotificationPayload) => Promise<string | null>;
  sendTest: () => Promise<void>;

  // Handlers
  notifyClassStarting: typeof handlers.notifyClassStarting;
  notifyYourTurn: typeof handlers.notifyYourTurn;
  notifyResultsPosted: typeof handlers.notifyResultsPosted;
  notifySyncError: typeof handlers.notifySyncError;
  notifySystemUpdate: typeof handlers.notifySystemUpdate;
  notifyAnnouncement: typeof handlers.notifyAnnouncement;

  // Queue management
  queueStatus: { count: number; pending: number };
  clearQueue: () => void;

  // DND and quiet hours
  isDNDActive: boolean;
  quietHours: QuietHoursConfig;
  dndConfig: DoNotDisturbConfig;
  setDND: (config: DoNotDisturbConfig) => void;
  enableDNDFor: (minutes: number, allowUrgent?: boolean) => void;
  disableDND: () => void;
  setQuietHours: (config: QuietHoursConfig) => void;

  // Badge management
  clearBadge: () => Promise<void>;

  // Analytics
  analytics: ReturnType<typeof notificationService.getDeliveryAnalytics>;

  // Clear all notifications
  clearAll: () => Promise<void>;
}

/**
 * Hook for managing notifications
 */
export function useNotifications(): UseNotificationsReturn {
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermissionStatus>(
    notificationService.getPermissionStatus()
  );
  const [queueStatus, setQueueStatus] = useState(notificationService.getQueueStatus());
  const [isDNDActive, setIsDNDActive] = useState(notificationService.isDNDActive());
  const [quietHours, setQuietHoursState] = useState<QuietHoursConfig>({
    enabled: false,
    startTime: '22:00',
    endTime: '08:00',
    allowUrgent: true,
  });
  const [dndConfig, setDNDConfigState] = useState<DoNotDisturbConfig>({
    enabled: false,
    allowUrgent: true,
    allowedTypes: [],
  });
  const [analytics, setAnalytics] = useState(notificationService.getDeliveryAnalytics());

  // Update states periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setQueueStatus(notificationService.getQueueStatus());
      setIsDNDActive(notificationService.isDNDActive());
      setAnalytics(notificationService.getDeliveryAnalytics());
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  // Request permission
  const requestPermission = useCallback(async () => {
    const permission = await notificationService.requestPermission();
    setPermissionStatus(notificationService.getPermissionStatus());
    return permission;
  }, []);

  // Send notification
  const send = useCallback(async (payload: NotificationPayload) => {
    const id = await notificationService.send(payload);
    setQueueStatus(notificationService.getQueueStatus());
    setAnalytics(notificationService.getDeliveryAnalytics());
    return id;
  }, []);

  // Send test notification
  const sendTest = useCallback(async () => {
    await notificationService.sendTestNotification();
  }, []);

  // Clear queue
  const clearQueue = useCallback(() => {
    notificationService.clearQueue();
    setQueueStatus(notificationService.getQueueStatus());
  }, []);

  // DND management
  const setDND = useCallback((config: DoNotDisturbConfig) => {
    notificationService.setDND(config);
    setDNDConfigState(config);
    setIsDNDActive(config.enabled);
  }, []);

  const enableDNDFor = useCallback((minutes: number, allowUrgent = true) => {
    notificationService.enableDNDFor(minutes, allowUrgent);
    setIsDNDActive(true);
  }, []);

  const disableDND = useCallback(() => {
    notificationService.disableDND();
    setIsDNDActive(false);
  }, []);

  // Quiet hours management
  const setQuietHours = useCallback((config: QuietHoursConfig) => {
    notificationService.setQuietHours(config);
    setQuietHoursState(config);
  }, []);

  // Badge management
  const clearBadge = useCallback(async () => {
    await notificationService.clearBadge();
  }, []);

  // Clear all notifications
  const clearAll = useCallback(async () => {
    await notificationService.clearAllNotifications();
    setAnalytics(notificationService.getDeliveryAnalytics());
  }, []);

  return {
    // Permission
    permissionStatus,
    requestPermission,

    // Send
    send,
    sendTest,

    // Handlers
    notifyClassStarting: handlers.notifyClassStarting,
    notifyYourTurn: handlers.notifyYourTurn,
    notifyResultsPosted: handlers.notifyResultsPosted,
    notifySyncError: handlers.notifySyncError,
    notifySystemUpdate: handlers.notifySystemUpdate,
    notifyAnnouncement: handlers.notifyAnnouncement,

    // Queue
    queueStatus: useMemo(() => ({
      count: queueStatus.count,
      // eslint-disable-next-line react-hooks/purity
      pending: queueStatus.items.filter(item => item.scheduledFor > Date.now()).length,
    }), [queueStatus]),
    clearQueue,

    // DND & Quiet Hours
    isDNDActive,
    quietHours,
    dndConfig,
    setDND,
    enableDNDFor,
    disableDND,
    setQuietHours,

    // Badge
    clearBadge,

    // Analytics
    analytics,

    // Clear all
    clearAll,
  };
}

/**
 * Hook for notification permission UI
 */
export function useNotificationPermission() {
  const [status, setStatus] = useState(notificationService.getPermissionStatus());
  const [isRequesting, setIsRequesting] = useState(false);

  const request = useCallback(async () => {
    if (isRequesting || status.permission === 'granted') return;

    setIsRequesting(true);
    try {
      await notificationService.requestPermission();
      setStatus(notificationService.getPermissionStatus());
    } finally {
      setIsRequesting(false);
    }
  }, [isRequesting, status.permission]);

  return {
    ...status,
    isRequesting,
    request,
    isGranted: status.permission === 'granted',
    isDenied: status.permission === 'denied',
    canRequest: status.canRequestPermission && !isRequesting,
  };
}

/**
 * Hook for DND quick toggle
 */
export function useDNDToggle() {
  const [isActive, setIsActive] = useState(notificationService.isDNDActive());

  useEffect(() => {
    // 30 second interval - DND status changes rarely (battery optimization)
    const interval = setInterval(() => {
      setIsActive(notificationService.isDNDActive());
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const toggle = useCallback(() => {
    if (isActive) {
      notificationService.disableDND();
    } else {
      notificationService.enableDNDFor(60); // 1 hour default
    }
    setIsActive(notificationService.isDNDActive());
  }, [isActive]);

  const setFor = useCallback((minutes: number, allowUrgent = true) => {
    notificationService.enableDNDFor(minutes, allowUrgent);
    setIsActive(true);
  }, []);

  const disable = useCallback(() => {
    notificationService.disableDND();
    setIsActive(false);
  }, []);

  return {
    isActive,
    toggle,
    setFor,
    disable,
  };
}

/**
 * Hook for badge count management
 */
export function useBadgeCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const updateCount = () => {
      const stored = localStorage.getItem('notification_badge_count');
      setCount(stored ? parseInt(stored, 10) : 0);
    };

    updateCount();

    // 15 second interval - badge count doesn't need real-time updates (battery optimization)
    const interval = setInterval(updateCount, 15000);
    return () => clearInterval(interval);
  }, []);

  const clear = useCallback(async () => {
    await notificationService.clearBadge();
    setCount(0);
  }, []);

  const set = useCallback((newCount: number) => {
    localStorage.setItem('notification_badge_count', newCount.toString());
    setCount(newCount);
  }, []);

  return {
    count,
    clear,
    set,
  };
}
