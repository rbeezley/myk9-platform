import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { logger } from '@/utils/logger';
import { useAnnouncementStore, type Announcement } from '@/stores/announcementStore';
import { notificationSoundService } from '@/services/notificationSoundService';

/**
 * Validates and fixes notification URLs.
 * Handles legacy/malformed URLs from push notifications.
 *
 * Valid routes:
 * - /announcements
 * - /class/{classId}/entries
 * - /trial/{trialId}/classes
 *
 * Invalid routes this fixes:
 * - /entries → /class/{classId}/entries (if classId available)
 * - /entries/{id} → /class/{classId}/entries (if classId available)
 * - /classes/{id} → /class/{classId}/entries
 */
function normalizeNotificationUrl(url: string | undefined, classId?: number): string {
  // Default fallback
  const defaultUrl = '/announcements';

  if (!url) return defaultUrl;

  // Already valid URLs - pass through
  if (url === '/announcements') return url;
  if (url.match(/^\/class\/\d+\/entries/)) return url;
  if (url.match(/^\/trial\/\d+\/classes/)) return url;

  // Fix malformed URLs if we have classId
  if (classId) {
    // /entries or /entries/{anything} → /class/{classId}/entries
    if (url === '/entries' || url.startsWith('/entries/')) {
      logger.warn(`Fixing malformed notification URL: ${url} → /class/${classId}/entries`);
      return `/class/${classId}/entries`;
    }

    // /classes/{id} → /class/{classId}/entries
    if (url.match(/^\/classes\/\d+/)) {
      logger.warn(`Fixing malformed notification URL: ${url} → /class/${classId}/entries`);
      return `/class/${classId}/entries`;
    }
  }

  // Unknown URL without classId - log warning and use default
  if (url !== defaultUrl && !url.startsWith('/class/') && !url.startsWith('/trial/')) {
    logger.warn(`Unknown notification URL pattern: ${url}, falling back to ${defaultUrl}`);
    return defaultUrl;
  }

  return url;
}

export interface InAppNotification {
  id: string;
  announcementId: number;
  title: string;
  content: string;
  priority: 'normal' | 'high' | 'urgent';
  type: 'announcement' | 'dog-alert' | 'system';
  timestamp: string;
  isRead: boolean;
  url?: string;
  dogId?: number;
  dogName?: string;
  classId?: number;
  licenseKey: string;
  showName?: string;
}

interface NotificationContextValue {
  // Notification state
  notifications: InAppNotification[];
  unreadCount: number;

  // Panel state
  isPanelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;

  // Notification actions
  addNotification: (notification: Omit<InAppNotification, 'id' | 'isRead' | 'timestamp'>) => void;
  markAsRead: (notificationId: string) => void;
  markAllAsRead: () => void;
  removeNotification: (notificationId: string) => void;
  clearAll: () => void;

  // Real-time connection
  isConnected: boolean;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

const MAX_NOTIFICATIONS = 50; // Keep last 50 notifications in memory
const NOTIFICATION_STORAGE_KEY = 'myK9Q_in_app_notifications';

/**
 * Convert a database announcement to InAppNotification format
 */
function announcementToNotification(announcement: Announcement, showName?: string): InAppNotification {
  return {
    id: `announcement_${announcement.id}`,
    announcementId: announcement.id,
    title: announcement.title,
    content: announcement.content,
    priority: announcement.priority,
    type: 'announcement',
    timestamp: announcement.created_at,
    isRead: announcement.is_read ?? false,
    url: '/announcements',
    licenseKey: announcement.license_key,
    showName: showName
  };
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Get announcements from the announcement store
  const { announcements, currentShowName, markAsRead: markAnnouncementAsRead } = useAnnouncementStore();

  // Initialize push notification state from localStorage (not in useEffect)
  const [pushNotifications, setPushNotifications] = useState<InAppNotification[]>(() => {
    try {
      const stored = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Filter to only show notifications from the last 24 hours
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const recent = parsed.filter((n: InAppNotification) => n.timestamp > oneDayAgo);
        return recent;
      }
    } catch (error) {
      logger.error('Error loading notifications from storage:', error);
    }
    return [];
  });

  // Track dismissed announcement IDs (cleared from inbox but still exist in DB)
  const [dismissedAnnouncementIds, setDismissedAnnouncementIds] = useState<Set<number>>(() => {
    try {
      const stored = localStorage.getItem('myK9Q_dismissed_announcements');
      if (stored) {
        return new Set(JSON.parse(stored));
      }
    } catch (error) {
      logger.error('Error loading dismissed announcements:', error);
    }
    return new Set();
  });

  const [isPanelOpen, setIsPanelOpen] = useState(false);
  // isConnected now reflects service worker availability (for push notifications)
  // rather than Supabase real-time subscription status
  const [isConnected, setIsConnected] = useState(false);

  // Save push notifications to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(pushNotifications));
    } catch (error) {
      logger.error('Error saving notifications to storage:', error);
    }
  }, [pushNotifications]);

  // Save dismissed announcement IDs to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('myK9Q_dismissed_announcements', JSON.stringify([...dismissedAnnouncementIds]));
    } catch (error) {
      logger.error('Error saving dismissed announcements:', error);
    }
  }, [dismissedAnnouncementIds]);

  // Merge announcements with push notifications
  // Announcements from store take priority (they have authoritative read status)
  // Push notifications for dog-alerts are kept separately
  const notifications = useMemo(() => {
    // Convert announcements to notification format (exclude expired and dismissed)
    const now = new Date();
    const announcementNotifs = announcements
      .filter(a => !a.expires_at || new Date(a.expires_at) > now)
      .filter(a => !dismissedAnnouncementIds.has(a.id))  // Filter out dismissed
      .map(a => announcementToNotification(a, currentShowName || undefined));

    // Get dog-alert push notifications (these don't come from announcements)
    const dogAlertNotifs = pushNotifications.filter(n => n.type === 'dog-alert');

    // Combine and sort by timestamp (newest first)
    const merged = [...announcementNotifs, ...dogAlertNotifs];
    merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return merged.slice(0, MAX_NOTIFICATIONS);
  }, [announcements, pushNotifications, currentShowName, dismissedAnnouncementIds]);

  // Calculate unread count
  const unreadCount = notifications.filter(n => !n.isRead).length;

  // Add notification (for push notifications only - announcements come from store)
  const addNotification = useCallback((notification: Omit<InAppNotification, 'id' | 'isRead' | 'timestamp'>) => {
    const newNotification: InAppNotification = {
      ...notification,
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      isRead: false,
      timestamp: new Date().toISOString()
    };

    setPushNotifications(prev => {
      // Add to beginning of array (newest first)
      const updated = [newNotification, ...prev];

      // Keep only MAX_NOTIFICATIONS most recent
      return updated.slice(0, MAX_NOTIFICATIONS);
    });

    // Note: Removed auto-dismiss behavior - notifications stay in center until manually dismissed
    // Users can clear individual notifications or use "Clear all" button
  }, []);

  // Mark notification as read
  const markAsRead = useCallback((notificationId: string) => {
    // Check if this is an announcement (id starts with 'announcement_')
    if (notificationId.startsWith('announcement_')) {
      const announcementId = parseInt(notificationId.replace('announcement_', ''), 10);
      if (!isNaN(announcementId)) {
        markAnnouncementAsRead(announcementId);
      }
    } else {
      // It's a push notification - update local state
      setPushNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
      );
    }
  }, [markAnnouncementAsRead]);

  // Mark all as read
  const markAllAsRead = useCallback(() => {
    // Mark all announcements as read via the store
    const announcementStore = useAnnouncementStore.getState();
    announcementStore.markAllAsRead();

    // Mark all push notifications as read
    setPushNotifications(prev =>
      prev.map(n => ({ ...n, isRead: true }))
    );
  }, []);

  // Remove notification (dismiss from inbox)
  const removeNotification = useCallback((notificationId: string) => {
    if (notificationId.startsWith('announcement_')) {
      // Dismiss announcement from inbox (add to dismissed set)
      const announcementId = parseInt(notificationId.replace('announcement_', ''), 10);
      if (!isNaN(announcementId)) {
        setDismissedAnnouncementIds(prev => new Set([...prev, announcementId]));
        // Also mark as read
        markAnnouncementAsRead(announcementId);
      }
    } else {
      // Remove push notification from local state
      setPushNotifications(prev => prev.filter(n => n.id !== notificationId));
    }
  }, [markAnnouncementAsRead]);

  // Clear all notifications (dismiss all from inbox)
  const clearAll = useCallback(() => {
    // Dismiss all announcements from inbox
    const announcementIds = announcements.map(a => a.id);
    setDismissedAnnouncementIds(prev => new Set([...prev, ...announcementIds]));

    // Mark all as read
    const announcementStore = useAnnouncementStore.getState();
    announcementStore.markAllAsRead();

    // Clear push notifications
    setPushNotifications([]);
  }, [announcements]);

  // Panel controls
  const openPanel = useCallback(() => {
    setIsPanelOpen(true);
  }, []);
  const closePanel = useCallback(() => setIsPanelOpen(false), []);
  const togglePanel = useCallback(() => setIsPanelOpen(prev => !prev), []);

  // Listen for push notifications from service worker
  useEffect(() => {
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_RECEIVED') {
        const data = event.data.data;
// Determine notification type based on backend payload
        let type: 'announcement' | 'dog-alert' | 'system' = 'announcement';
        if (data.type === 'up_soon' || data.type === 'dog-alert') {
          type = 'dog-alert';
        } else if (data.type === 'come_to_gate') {
          type = 'dog-alert'; // Also a dog-specific alert
        } else if (data.type === 'announcement') {
          type = 'announcement';
        }

        // Extract classId from payload (supports both snake_case and camelCase)
        const classId = data.class_id || data.classId;

        // Determine priority for sound
        // Dog alerts are always urgent - missing your turn is critical!
        const isDogAlert = type === 'dog-alert';
        const priority = isDogAlert ? 'urgent' : (data.priority || 'normal') as 'normal' | 'high' | 'urgent';

        // Add to notification center with normalized URL
        addNotification({
          announcementId: data.id || data.announcement_id || 0,
          title: data.title || 'Notification',
          content: data.body || data.content || '',
          priority,
          type,
          // Use normalizeNotificationUrl to fix malformed URLs from legacy triggers
          url: normalizeNotificationUrl(data.url, classId),
          dogId: data.dogId,
          dogName: data.dog_name || data.dogName,
          classId: classId,
          licenseKey: data.license_key || data.licenseKey || '',
          showName: data.show_name || data.showName
        });

        // Play notification sound (when app is in foreground)
        notificationSoundService.playNotificationSound(priority);
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
      // Check if service worker is ready (indicates push notifications can work)
      navigator.serviceWorker.ready.then(() => {
        setIsConnected(true);
      });
      return () => {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      };
    }
  }, [addNotification]);

  // Note: Real-time subscription on announcements table was REMOVED to prevent duplicate notifications.
  // Push notifications (via database trigger → Edge function → service worker) are the single source of truth.
  // The service worker forwards push notifications to this context via the message handler above.
  // If you need real-time updates without push notifications, re-enable this subscription,
  // but be aware it will cause duplicates if push notifications are also enabled.

  const value: NotificationContextValue = {
    notifications,
    unreadCount,
    isPanelOpen,
    openPanel,
    closePanel,
    togglePanel,
    addNotification,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll,
    isConnected
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};
