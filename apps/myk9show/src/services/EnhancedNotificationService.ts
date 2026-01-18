import { notificationService } from './NotificationService';
import { NotificationMessage, NotificationType as AuditNotificationType } from '@/types/audit-types';
import { auditService } from './AuditService';
import { AuditAction } from '@/types/audit-types';
import { logger } from '@/services/LoggingService';

export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent'
}

export enum NotificationCategory {
  ENTRY_UPDATE = 'entry_update',
  PAYMENT_UPDATE = 'payment_update',
  SCHEDULE_CHANGE = 'schedule_change',
  SYSTEM_ALERT = 'system_alert',
  JUDGE_ASSIGNMENT = 'judge_assignment',
  RESULTS_POSTED = 'results_posted',
  REMINDER = 'reminder',
  ANNOUNCEMENT = 'announcement'
}

export interface EnhancedNotification extends NotificationMessage {
  id: string;
  priority: NotificationPriority;
  category: NotificationCategory;
  title: string;
  body: string;
  channel: string;
  sender: {
    id: string;
    name: string;
    role: string;
  };
  actionUrl?: string;
  actionText?: string;
  imageUrl?: string;
  timestamp: Date;
  expiresAt?: Date;
  isRead: boolean;
  isArchived: boolean;
  metadata: {
    showId?: string;
    entryId?: string;
    classId?: string;
    trialId?: string;
    userId?: string;
    organizationId?: string;
    [key: string]: unknown;
  };
}

export interface NotificationTemplate {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  priority: NotificationPriority;
  actionText?: string;
  variables: string[];
}

export interface NotificationPreferences {
  userId: string;
  categories: {
    [K in NotificationCategory]: {
      enabled: boolean;
      channels: NotificationChannel[];
      minPriority: NotificationPriority;
    };
  };
  quietHours: {
    enabled: boolean;
    start: string; // HH:MM format
    end: string;   // HH:MM format
  };
  digest: {
    enabled: boolean;
    frequency: 'daily' | 'weekly';
    time: string; // HH:MM format
  };
}

export enum NotificationChannel {
  IN_APP = 'in_app',
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push'
}

export class EnhancedNotificationService {
  private notifications: Map<string, EnhancedNotification> = new Map();
  private preferences: Map<string, NotificationPreferences> = new Map();
  private templates: Map<string, NotificationTemplate> = new Map();
  private deliveryQueue: EnhancedNotification[] = [];
  private isProcessing = false;

  constructor() {
    this.loadNotifications();
    this.loadPreferences();
    this.initializeTemplates();
    this.startDeliveryProcessor();
  }

  async sendNotification(
    notification: Omit<EnhancedNotification, 'id' | 'timestamp' | 'isRead' | 'isArchived'>
  ): Promise<string> {
    const enhancedNotification: EnhancedNotification = {
      ...notification,
      id: this.generateNotificationId(),
      timestamp: new Date(),
      isRead: false,
      isArchived: false
    };

    // Store notification
    this.notifications.set(enhancedNotification.id, enhancedNotification);
    this.saveNotifications();

    // Add to delivery queue
    this.deliveryQueue.push(enhancedNotification);

    // Audit log
    await auditService.log({
      action: AuditAction.CREATE,
      entityType: 'notification',
      entityId: enhancedNotification.id,
      metadata: {
        category: enhancedNotification.category,
        priority: enhancedNotification.priority,
        recipientChannel: enhancedNotification.channel,
        title: enhancedNotification.title
      }
    });

    return enhancedNotification.id;
  }

  async sendBulkNotifications(
    notifications: Array<Omit<EnhancedNotification, 'id' | 'timestamp' | 'isRead' | 'isArchived'>>
  ): Promise<string[]> {
    const notificationIds: string[] = [];

    for (const notification of notifications) {
      const id = await this.sendNotification(notification);
      notificationIds.push(id);
    }

    return notificationIds;
  }

  async sendFromTemplate(
    templateId: string,
    variables: Record<string, string>,
    recipient: {
      userId: string;
      channel: string;
    },
    metadata: Record<string, unknown> = {}
  ): Promise<string> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Notification template not found: ${templateId}`);
    }

    // Replace variables in template
    let title = template.title;
    let body = template.body;
    
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      title = title.replace(new RegExp(placeholder, 'g'), value);
      body = body.replace(new RegExp(placeholder, 'g'), value);
    }

    return this.sendNotification({
      type: AuditNotificationType.NOTIFICATION,
      channel: recipient.channel,
      sender: {
        id: 'system',
        name: 'System',
        role: 'system'
      },
      data: {},
      priority: template.priority,
      category: template.category,
      title,
      body,
      ...(template.actionText !== undefined && { actionText: template.actionText }),
      metadata: {
        templateId,
        userId: recipient.userId,
        ...metadata
      }
    });
  }

  async getUserNotifications(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      category?: NotificationCategory | undefined;
      priority?: NotificationPriority | undefined;
      unreadOnly?: boolean;
      includeArchived?: boolean;
    } = {}
  ): Promise<{ notifications: EnhancedNotification[]; total: number }> {
    let userNotifications = Array.from(this.notifications.values())
      .filter(n => n.metadata.userId === userId);

    // Apply filters
    if (options.category) {
      userNotifications = userNotifications.filter(n => n.category === options.category);
    }

    if (options.priority) {
      userNotifications = userNotifications.filter(n => n.priority === options.priority);
    }

    if (options.unreadOnly) {
      userNotifications = userNotifications.filter(n => !n.isRead);
    }

    if (!options.includeArchived) {
      userNotifications = userNotifications.filter(n => !n.isArchived);
    }

    // Remove expired notifications
    const now = new Date();
    userNotifications = userNotifications.filter(n => 
      !n.expiresAt || n.expiresAt > now
    );

    // Sort by timestamp (newest first)
    userNotifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const total = userNotifications.length;
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    return {
      notifications: userNotifications.slice(offset, offset + limit),
      total
    };
  }

  async markAsRead(notificationId: string, userId?: string): Promise<void> {
    const notification = this.notifications.get(notificationId);
    if (!notification) return;

    if (userId && notification.metadata.userId !== userId) return;

    notification.isRead = true;
    this.notifications.set(notificationId, notification);
    this.saveNotifications();

    await auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'notification',
      entityId: notificationId,
      metadata: {
        action: 'mark_read',
        userId: userId || notification.metadata.userId
      }
    });
  }

  async markAllAsRead(userId: string, category?: NotificationCategory): Promise<void> {
    let userNotifications = Array.from(this.notifications.values())
      .filter(n => n.metadata.userId === userId && !n.isRead);

    if (category) {
      userNotifications = userNotifications.filter(n => n.category === category);
    }

    for (const notification of userNotifications) {
      notification.isRead = true;
      this.notifications.set(notification.id, notification);
    }

    this.saveNotifications();

    await auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'notification_bulk',
      entityId: `bulk_read_${Date.now()}`,
      metadata: {
        action: 'mark_all_read',
        userId,
        category,
        count: userNotifications.length
      }
    });
  }

  async archiveNotification(notificationId: string, userId?: string): Promise<void> {
    const notification = this.notifications.get(notificationId);
    if (!notification) return;

    if (userId && notification.metadata.userId !== userId) return;

    notification.isArchived = true;
    this.notifications.set(notificationId, notification);
    this.saveNotifications();
  }

  async deleteNotification(notificationId: string, userId?: string): Promise<void> {
    const notification = this.notifications.get(notificationId);
    if (!notification) return;

    if (userId && notification.metadata.userId !== userId) return;

    this.notifications.delete(notificationId);
    this.saveNotifications();

    await auditService.log({
      action: AuditAction.DELETE,
      entityType: 'notification',
      entityId: notificationId,
      metadata: {
        userId: userId || notification.metadata.userId
      }
    });
  }

  async getUnreadCount(userId: string, category?: NotificationCategory): Promise<number> {
    let userNotifications = Array.from(this.notifications.values())
      .filter(n => n.metadata.userId === userId && !n.isRead && !n.isArchived);

    if (category) {
      userNotifications = userNotifications.filter(n => n.category === category);
    }

    // Remove expired notifications
    const now = new Date();
    userNotifications = userNotifications.filter(n => 
      !n.expiresAt || n.expiresAt > now
    );

    return userNotifications.length;
  }

  async updatePreferences(userId: string, preferences: Partial<NotificationPreferences>): Promise<void> {
    const current = this.preferences.get(userId) || this.getDefaultPreferences(userId);
    const updated = { ...current, ...preferences };
    
    this.preferences.set(userId, updated);
    this.savePreferences();

    await auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'notification_preferences',
      entityId: userId,
      metadata: {
        updatedFields: Object.keys(preferences)
      }
    });
  }

  async getUserPreferences(userId: string): Promise<NotificationPreferences> {
    return this.preferences.get(userId) || this.getDefaultPreferences(userId);
  }

  async scheduleReminder(
    notification: Omit<EnhancedNotification, 'id' | 'timestamp' | 'isRead' | 'isArchived' | 'category'>,
    scheduleTime: Date
  ): Promise<string> {
    const reminderNotification: EnhancedNotification = {
      ...notification,
      id: this.generateNotificationId(),
      category: NotificationCategory.REMINDER,
      timestamp: scheduleTime,
      isRead: false,
      isArchived: false
    };

    // Schedule for future delivery
    const delay = scheduleTime.getTime() - Date.now();
    if (delay > 0) {
      setTimeout(() => {
        this.deliveryQueue.push(reminderNotification);
      }, delay);
    } else {
      // Past date, deliver immediately
      this.deliveryQueue.push(reminderNotification);
    }

    this.notifications.set(reminderNotification.id, reminderNotification);
    this.saveNotifications();

    return reminderNotification.id;
  }

  private async processDeliveryQueue(): Promise<void> {
    if (this.isProcessing || this.deliveryQueue.length === 0) return;

    this.isProcessing = true;

    try {
      while (this.deliveryQueue.length > 0) {
        const notification = this.deliveryQueue.shift()!;
        
        // Check if user should receive this notification
        const preferences = await this.getUserPreferences(notification.metadata.userId || '');
        const categoryPrefs = preferences.categories[notification.category];

        if (!categoryPrefs?.enabled) continue;

        // Check priority threshold
        const priorityLevels = [
          NotificationPriority.LOW,
          NotificationPriority.NORMAL,
          NotificationPriority.HIGH,
          NotificationPriority.URGENT
        ];
        
        const notificationPriorityLevel = priorityLevels.indexOf(notification.priority);
        const minPriorityLevel = priorityLevels.indexOf(categoryPrefs.minPriority);
        
        if (notificationPriorityLevel < minPriorityLevel) continue;

        // Check quiet hours
        if (this.isQuietHours(preferences)) {
          // Queue for later delivery unless urgent
          if (notification.priority !== NotificationPriority.URGENT) {
            setTimeout(() => {
              this.deliveryQueue.push(notification);
            }, 60 * 60 * 1000); // Retry in 1 hour
            continue;
          }
        }

        // Deliver through configured channels
        for (const channel of categoryPrefs.channels) {
          await this.deliverNotification(notification, channel);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async deliverNotification(
    notification: EnhancedNotification,
    channel: NotificationChannel
  ): Promise<void> {
    try {
      switch (channel) {
        case NotificationChannel.IN_APP:
          // Deliver via existing WebSocket service
          notificationService.publish({
            type: AuditNotificationType.NOTIFICATION,
            channel: `user:${notification.metadata.userId}`,
            sender: notification.sender,
            data: {
              notification: {
                id: notification.id,
                title: notification.title,
                body: notification.body,
                category: notification.category,
                priority: notification.priority,
                actionUrl: notification.actionUrl,
                actionText: notification.actionText,
                timestamp: notification.timestamp.toISOString()
              }
            }
          });
          break;
          
        case NotificationChannel.EMAIL:
          // Email delivery would be implemented here
          logger.debug('Email notification delivery not implemented', 'notification');
          break;

        case NotificationChannel.SMS:
          // SMS delivery would be implemented here
          logger.debug('SMS notification delivery not implemented', 'notification');
          break;
          
        case NotificationChannel.PUSH:
          // Push notification delivery would be implemented here
          if ('serviceWorker' in navigator && 'PushManager' in window) {
            // Browser push notification implementation
          }
          break;
      }

      await auditService.log({
        action: AuditAction.SYSTEM_ACTION,
        entityType: 'notification_delivery',
        entityId: notification.id,
        metadata: {
          channel,
          userId: notification.metadata.userId,
          category: notification.category,
          priority: notification.priority
        }
      });

    } catch (error) {
      logger.error('Failed to deliver notification', 'notification', { channel, notificationId: notification.id }, error as Error);
    }
  }

  private isQuietHours(preferences: NotificationPreferences): boolean {
    if (!preferences.quietHours.enabled) return false;

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const [startHour, startMin] = preferences.quietHours.start.split(':').map(Number);
    const [endHour, endMin] = preferences.quietHours.end.split(':').map(Number);
    
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    if (startTime <= endTime) {
      return currentTime >= startTime && currentTime <= endTime;
    } else {
      // Crosses midnight
      return currentTime >= startTime || currentTime <= endTime;
    }
  }

  private getDefaultPreferences(userId: string): NotificationPreferences {
    const defaultCategoryPrefs = {
      enabled: true,
      channels: [NotificationChannel.IN_APP],
      minPriority: NotificationPriority.NORMAL
    };

    return {
      userId,
      categories: {
        [NotificationCategory.ENTRY_UPDATE]: defaultCategoryPrefs,
        [NotificationCategory.PAYMENT_UPDATE]: defaultCategoryPrefs,
        [NotificationCategory.SCHEDULE_CHANGE]: { ...defaultCategoryPrefs, minPriority: NotificationPriority.HIGH },
        [NotificationCategory.SYSTEM_ALERT]: { ...defaultCategoryPrefs, minPriority: NotificationPriority.HIGH },
        [NotificationCategory.JUDGE_ASSIGNMENT]: defaultCategoryPrefs,
        [NotificationCategory.RESULTS_POSTED]: defaultCategoryPrefs,
        [NotificationCategory.REMINDER]: defaultCategoryPrefs,
        [NotificationCategory.ANNOUNCEMENT]: { ...defaultCategoryPrefs, minPriority: NotificationPriority.LOW }
      },
      quietHours: {
        enabled: false,
        start: '22:00',
        end: '08:00'
      },
      digest: {
        enabled: false,
        frequency: 'daily',
        time: '09:00'
      }
    };
  }

  private initializeTemplates(): void {
    const templates: NotificationTemplate[] = [
      {
        id: 'entry_accepted',
        category: NotificationCategory.ENTRY_UPDATE,
        title: 'Entry Accepted',
        body: 'Your entry for {{dogName}} in {{showName}} has been accepted!',
        priority: NotificationPriority.NORMAL,
        actionText: 'View Entry',
        variables: ['dogName', 'showName']
      },
      {
        id: 'entry_rejected',
        category: NotificationCategory.ENTRY_UPDATE,
        title: 'Entry Status Update',
        body: 'Your entry for {{dogName}} in {{showName}} was not accepted. {{reason}}',
        priority: NotificationPriority.HIGH,
        actionText: 'View Details',
        variables: ['dogName', 'showName', 'reason']
      },
      {
        id: 'payment_reminder',
        category: NotificationCategory.PAYMENT_UPDATE,
        title: 'Payment Due',
        body: 'Payment of ${{amount}} is due for {{showName}}. Due date: {{dueDate}}',
        priority: NotificationPriority.HIGH,
        actionText: 'Pay Now',
        variables: ['amount', 'showName', 'dueDate']
      },
      {
        id: 'schedule_change',
        category: NotificationCategory.SCHEDULE_CHANGE,
        title: 'Schedule Change',
        body: 'The schedule for {{className}} has changed. New time: {{newTime}}',
        priority: NotificationPriority.HIGH,
        actionText: 'View Schedule',
        variables: ['className', 'newTime']
      },
      {
        id: 'judge_assignment',
        category: NotificationCategory.JUDGE_ASSIGNMENT,
        title: 'New Judge Assignment',
        body: 'You have been assigned to judge {{className}} at {{showName}} on {{date}}',
        priority: NotificationPriority.NORMAL,
        actionText: 'View Assignment',
        variables: ['className', 'showName', 'date']
      }
    ];

    templates.forEach(template => {
      this.templates.set(template.id, template);
    });
  }

  private startDeliveryProcessor(): void {
    // Process delivery queue every 30 seconds
    setInterval(() => {
      this.processDeliveryQueue();
    }, 30 * 1000);
  }

  private generateNotificationId(): string {
    return `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private loadNotifications(): void {
    try {
      const stored = localStorage.getItem('enhanced_notifications');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.notifications = new Map(
          parsed.map((notification: EnhancedNotification) => [
            notification.id,
            {
              ...notification,
              timestamp: new Date(notification.timestamp),
              expiresAt: notification.expiresAt ? new Date(notification.expiresAt) : undefined
            }
          ])
        );
      }
    } catch (error) {
      logger.error('Failed to load notifications', 'notification', {}, error as Error);
    }
  }

  private saveNotifications(): void {
    try {
      const notifications = Array.from(this.notifications.values());
      localStorage.setItem('enhanced_notifications', JSON.stringify(notifications));
    } catch (error) {
      logger.error('Failed to save notifications', 'notification', {}, error as Error);
    }
  }

  private loadPreferences(): void {
    try {
      const stored = localStorage.getItem('notification_preferences');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.preferences = new Map(Object.entries(parsed));
      }
    } catch (error) {
      logger.error('Failed to load notification preferences', 'notification', {}, error as Error);
    }
  }

  private savePreferences(): void {
    try {
      const preferences = Object.fromEntries(this.preferences);
      localStorage.setItem('notification_preferences', JSON.stringify(preferences));
    } catch (error) {
      logger.error('Failed to save notification preferences', 'notification', {}, error as Error);
    }
  }
}

export const enhancedNotificationService = new EnhancedNotificationService();