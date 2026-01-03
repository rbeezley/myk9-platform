/**
 * Comprehensive Notification Service
 *
 * Handles all notification types, permissions, scheduling, queueing, and delivery tracking.
 * Integrates with settings to respect user preferences including Do Not Disturb mode.
 */

import { useSettingsStore } from '@/stores/settingsStore';
import voiceAnnouncementService from './voiceAnnouncementService';
import { logger } from '@/utils/logger';
import {
  getVibrationPattern,
  generateAnnouncementText,
  buildNotificationOptions
} from './notificationServiceHelpers';

/**
 * Type guard for Badging API support
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Badging_API
 */
function hasBadgingAPI(nav: Navigator): nav is Navigator & {
  setAppBadge: (count: number) => Promise<void>;
  clearAppBadge: () => Promise<void>;
} {
  return 'setAppBadge' in nav && 'clearAppBadge' in nav;
}

export type NotificationType =
  | 'class_starting'
  | 'your_turn'
  | 'results_posted'
  | 'sync_error'
  | 'system_update'
  | 'announcement'
  | 'urgent_announcement';

export interface NotificationPayload {
  id?: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  requireInteraction?: boolean;
  silent?: boolean;
  tag?: string;
  icon?: string;
  badge?: string;
  image?: string;
  vibrate?: number[];
  sound?: string;
  actions?: NotificationAction[];
  timestamp?: number;
}

export interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

export interface NotificationPermissionStatus {
  permission: NotificationPermission;
  supported: boolean;
  canRequestPermission: boolean;
}

export interface NotificationQueueItem {
  id: string;
  payload: NotificationPayload;
  scheduledFor: number; // timestamp
  retryCount: number;
  maxRetries: number;
  createdAt: number;
}

export interface NotificationDeliveryRecord {
  id: string;
  type: NotificationType;
  sentAt: number;
  delivered: boolean;
  clicked: boolean;
  dismissed: boolean;
  error?: string;
  licenseKey?: string;
}

export interface QuietHoursConfig {
  enabled: boolean;
  startTime: string; // "22:00" (24-hour format)
  endTime: string; // "08:00"
  allowUrgent: boolean; // Allow urgent notifications during quiet hours
}

export interface DoNotDisturbConfig {
  enabled: boolean;
  until?: number; // timestamp - when to auto-disable
  allowUrgent: boolean; // Allow urgent notifications
  allowedTypes: NotificationType[]; // Specific types allowed during DND
}

/**
 * Comprehensive Notification Service
 */
class NotificationService {
  private static instance: NotificationService;
  private queue: NotificationQueueItem[] = [];
  private deliveryRecords: NotificationDeliveryRecord[] = [];
  private queueProcessingInterval: number | null = null;
  private registration: ServiceWorkerRegistration | null = null;

  private constructor() {
    this.initializeServiceWorker();
    this.startQueueProcessing();
    this.setupVisibilityChangeListener();
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Initialize service worker for push notifications
   */
  private async initializeServiceWorker(): Promise<void> {
    if ('serviceWorker' in navigator) {
      try {
        this.registration = await navigator.serviceWorker.ready;
} catch (error) {
        logger.error('Failed to initialize service worker:', error);
      }
    }
  }

  /**
   * Check notification permission status
   */
  getPermissionStatus(): NotificationPermissionStatus {
    const supported = 'Notification' in window;

    return {
      permission: supported ? Notification.permission : 'denied',
      supported,
      canRequestPermission: supported && Notification.permission === 'default',
    };
  }

  /**
   * Request notification permission from user
   */
  async requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      logger.warn('Notifications not supported');
      return 'denied';
    }

    if (Notification.permission === 'granted') {
      return 'granted';
    }

    if (Notification.permission === 'denied') {
      return 'denied';
    }

    try {
      const permission = await Notification.requestPermission();
// If permission granted, update settings
      if (permission === 'granted') {
        useSettingsStore.getState().updateSettings({ enableNotifications: true });
      }

      return permission;
    } catch (error) {
      logger.error('Error requesting notification permission:', error);
      return 'denied';
    }
  }

  /**
   * Check if notifications are enabled in settings
   */
  private areNotificationsEnabled(): boolean {
    const { settings } = useSettingsStore.getState();
    return settings.enableNotifications && Notification.permission === 'granted';
  }

  /**
   * Check if a specific notification type is enabled
   */
  private isNotificationTypeEnabled(_type: NotificationType): boolean {
    // In-app notifications are always enabled
    // (Previously had user-configurable toggles, but those have been removed for simplicity)
    return true;
  }

  /**
   * Get quiet hours configuration from settings
   */
  private getQuietHoursConfig(): QuietHoursConfig {
    // Get from localStorage or settings
    const stored = localStorage.getItem('notification_quiet_hours');
    if (stored) {
      return JSON.parse(stored);
    }

    // Default quiet hours: 10 PM to 8 AM
    return {
      enabled: false,
      startTime: '22:00',
      endTime: '08:00',
      allowUrgent: true,
    };
  }

  /**
   * Set quiet hours configuration
   */
  setQuietHours(config: QuietHoursConfig): void {
    localStorage.setItem('notification_quiet_hours', JSON.stringify(config));
}

  /**
   * Check if currently in quiet hours
   */
  private isQuietHours(): boolean {
    const config = this.getQuietHoursConfig();
    if (!config.enabled) return false;

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const { startTime, endTime } = config;

    // Handle overnight quiet hours (e.g., 22:00 to 08:00)
    if (startTime > endTime) {
      return currentTime >= startTime || currentTime <= endTime;
    }

    // Handle same-day quiet hours (e.g., 13:00 to 17:00)
    return currentTime >= startTime && currentTime <= endTime;
  }

  /**
   * Get Do Not Disturb configuration
   */
  private getDNDConfig(): DoNotDisturbConfig {
    const stored = localStorage.getItem('notification_dnd');
    if (stored) {
      const config: DoNotDisturbConfig = JSON.parse(stored);

      // Check if DND has expired
      if (config.until && config.until < Date.now()) {
        config.enabled = false;
        this.setDND(config);
      }

      return config;
    }

    return {
      enabled: false,
      allowUrgent: true,
      allowedTypes: [],
    };
  }

  /**
   * Set Do Not Disturb mode
   */
  setDND(config: DoNotDisturbConfig): void {
    localStorage.setItem('notification_dnd', JSON.stringify(config));
}

  /**
   * Enable Do Not Disturb for a duration
   */
  enableDNDFor(minutes: number, allowUrgent = true): void {
    this.setDND({
      enabled: true,
      until: Date.now() + (minutes * 60 * 1000),
      allowUrgent,
      allowedTypes: [],
    });
  }

  /**
   * Disable Do Not Disturb
   */
  disableDND(): void {
    this.setDND({
      enabled: false,
      allowUrgent: true,
      allowedTypes: [],
    });
  }

  /**
   * Check if DND is active
   */
  isDNDActive(): boolean {
    return this.getDNDConfig().enabled;
  }

  /**
   * Check if notification should be blocked by DND or quiet hours
   */
  private shouldBlockNotification(payload: NotificationPayload): boolean {
    const isUrgent = payload.priority === 'urgent';

    // Check DND
    const dndConfig = this.getDNDConfig();
    if (dndConfig.enabled) {
      // Allow if it's urgent and DND allows urgent
      if (isUrgent && dndConfig.allowUrgent) {
        return false;
      }

      // Allow if type is in allowed list
      if (dndConfig.allowedTypes.includes(payload.type)) {
        return false;
      }

return true;
    }

    // Check quiet hours
    if (this.isQuietHours()) {
      const quietConfig = this.getQuietHoursConfig();

      // Allow urgent notifications during quiet hours if configured
      if (isUrgent && quietConfig.allowUrgent) {
        return false;
      }

return true;
    }

    return false;
  }

  /**
   * Send a notification immediately
   */
  async send(payload: NotificationPayload): Promise<string | null> {
    // Check if notifications are globally enabled
    if (!this.areNotificationsEnabled()) {
return null;
    }

    // Check if this notification type is enabled
    if (!this.isNotificationTypeEnabled(payload.type)) {
return null;
    }

    // Check DND and quiet hours
    if (this.shouldBlockNotification(payload)) {
      // Queue for later if it's important
      if (payload.priority === 'high' || payload.priority === 'urgent') {
        return this.queueNotification(payload);
      }
      return null;
    }

    const notificationId = payload.id || this.generateNotificationId();
    const { settings } = useSettingsStore.getState();

    try {
      // Trigger haptic feedback if enabled
      if (settings.hapticFeedback && 'vibrate' in navigator) {
        const vibrationPattern = this.getVibrationPattern(payload.priority || 'normal');
        navigator.vibrate(vibrationPattern);
      }

      // Voice announcement if enabled (uses global Voice Settings)
      // Suppress voice if actively scoring to prevent interrupting timer announcements
      if (settings.voiceNotifications && !payload.silent && !voiceAnnouncementService.isScoringInProgress()) {
        this.announceNotification(payload);
      }

      // Create notification options (delegated to helper)
      const options = buildNotificationOptions(payload, notificationId);

      // Send notification
      if (this.registration) {
        await this.registration.showNotification(payload.title, options);
      } else {
        new Notification(payload.title, options);
      }

      // Update badge count if enabled
      if (settings.showBadges) {
        this.updateBadgeCount(1);
      }

      // Record delivery
      this.recordDelivery({
        id: notificationId,
        type: payload.type,
        sentAt: Date.now(),
        delivered: true,
        clicked: false,
        dismissed: false,
      });

return notificationId;

    } catch (error) {
      logger.error('Failed to send notification:', error);

      // Record failed delivery
      this.recordDelivery({
        id: notificationId,
        type: payload.type,
        sentAt: Date.now(),
        delivered: false,
        clicked: false,
        dismissed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return null;
    }
  }

  /**
   * Queue a notification for later delivery
   */
  queueNotification(payload: NotificationPayload, scheduledFor?: number): string {
    const id = payload.id || this.generateNotificationId();
    const queueItem: NotificationQueueItem = {
      id,
      payload: { ...payload, id },
      scheduledFor: scheduledFor || Date.now(),
      retryCount: 0,
      maxRetries: 3,
      createdAt: Date.now(),
    };

    this.queue.push(queueItem);
return id;
  }

  /**
   * Process notification queue
   */
  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) return;

    const now = Date.now();
    const readyItems = this.queue.filter(item => item.scheduledFor <= now);

    for (const item of readyItems) {
      try {
        const sent = await this.send(item.payload);

        if (sent) {
          // Remove from queue
          this.queue = this.queue.filter(q => q.id !== item.id);
        } else {
          // Retry later if not sent
          item.retryCount++;

          if (item.retryCount >= item.maxRetries) {
            logger.error('Max retries reached for notification:', item.id);
            this.queue = this.queue.filter(q => q.id !== item.id);
          } else {
            // Exponential backoff: 1min, 2min, 4min
            item.scheduledFor = now + (Math.pow(2, item.retryCount) * 60 * 1000);
          }
        }
      } catch (error) {
        logger.error('Error processing queued notification:', error);
      }
    }
  }

  /**
   * Start queue processing interval
   */
  private startQueueProcessing(): void {
    if (this.queueProcessingInterval) return;

    // Process queue every 30 seconds
    this.queueProcessingInterval = window.setInterval(() => {
      this.processQueue();
    }, 30000);
  }


  /**
   * Get queue status
   */
  getQueueStatus(): { count: number; items: NotificationQueueItem[] } {
    return {
      count: this.queue.length,
      items: [...this.queue],
    };
  }

  /**
   * Clear notification queue
   */
  clearQueue(): void {
    this.queue = [];
}

  /**
   * Get vibration pattern for priority (delegated to helper)
   */
  private getVibrationPattern(priority: string): number[] {
    return getVibrationPattern(priority);
  }

  /**
   * Announce notification using voice synthesis (delegated to helper)
   */
  private announceNotification(payload: NotificationPayload): void {
    try {
      const text = generateAnnouncementText(payload);

      if (text) {
        voiceAnnouncementService.announce({
          text,
          priority: payload.priority === 'urgent' ? 'high' : 'normal',
        });
      }
    } catch (error) {
      logger.error('Failed to announce notification:', error);
      // Don't throw - voice announcement failure shouldn't break notifications
    }
  }

  /**
   * Update PWA badge count
   */
  private async updateBadgeCount(increment: number): Promise<void> {
    if (hasBadgingAPI(navigator)) {
      try {
        const currentBadge = await this.getBadgeCount();
        const newBadge = Math.max(0, currentBadge + increment);

        if (newBadge > 0) {
          await navigator.setAppBadge(newBadge);
        } else {
          await navigator.clearAppBadge();
        }
      } catch (error) {
        logger.warn('Could not update badge count:', error);
      }
    }
  }

  /**
   * Get current badge count
   */
  private async getBadgeCount(): Promise<number> {
    // Get from local storage as Badge API doesn't provide getter
    const stored = localStorage.getItem('notification_badge_count');
    return stored ? parseInt(stored, 10) : 0;
  }

  /**
   * Clear badge count
   */
  async clearBadge(): Promise<void> {
    if (hasBadgingAPI(navigator)) {
      try {
        await navigator.clearAppBadge();
        localStorage.setItem('notification_badge_count', '0');
      } catch (error) {
        logger.warn('Could not clear badge:', error);
      }
    }
  }

  /**
   * Record notification delivery
   */
  private recordDelivery(record: NotificationDeliveryRecord): void {
    this.deliveryRecords.push(record);

    // Keep only last 100 records
    if (this.deliveryRecords.length > 100) {
      this.deliveryRecords = this.deliveryRecords.slice(-100);
    }
  }

  /**
   * Get delivery analytics
   */
  getDeliveryAnalytics(): {
    total: number;
    delivered: number;
    failed: number;
    clicked: number;
    dismissed: number;
    deliveryRate: number;
    clickRate: number;
  } {
    const total = this.deliveryRecords.length;
    const delivered = this.deliveryRecords.filter(r => r.delivered).length;
    const failed = total - delivered;
    const clicked = this.deliveryRecords.filter(r => r.clicked).length;
    const dismissed = this.deliveryRecords.filter(r => r.dismissed).length;

    return {
      total,
      delivered,
      failed,
      clicked,
      dismissed,
      deliveryRate: total > 0 ? (delivered / total) * 100 : 0,
      clickRate: delivered > 0 ? (clicked / delivered) * 100 : 0,
    };
  }

  /**
   * Mark notification as clicked
   */
  markAsClicked(notificationId: string): void {
    const record = this.deliveryRecords.find(r => r.id === notificationId);
    if (record) {
      record.clicked = true;
    }
  }

  /**
   * Mark notification as dismissed
   */
  markAsDismissed(notificationId: string): void {
    const record = this.deliveryRecords.find(r => r.id === notificationId);
    if (record) {
      record.dismissed = true;
    }
  }

  /**
   * Setup visibility change listener to process queue when page becomes visible
   */
  private setupVisibilityChangeListener(): void {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.processQueue();
      }
    });
  }

  /**
   * Generate unique notification ID
   */
  private generateNotificationId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clear all notifications
   */
  async clearAllNotifications(): Promise<void> {
    if (this.registration) {
      const notifications = await this.registration.getNotifications();
      notifications.forEach(notification => notification.close());
}

    await this.clearBadge();
  }

  /**
   * Test notification (for debugging)
   */
  async sendTestNotification(): Promise<void> {
    await this.send({
      type: 'system_update',
      title: '🧪 Test Notification',
      body: 'This is a test notification from the notification service',
      priority: 'normal',
    });
  }
}

// Export singleton instance
export const notificationService = NotificationService.getInstance();
