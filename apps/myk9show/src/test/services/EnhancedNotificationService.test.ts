import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  EnhancedNotificationService,
  NotificationPriority,
  NotificationCategory,
  NotificationChannel
} from '../../services/EnhancedNotificationService';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock notification service
vi.mock('../../services/NotificationService', () => ({
  notificationService: {
    publish: vi.fn(),
  },
}));

// Mock audit service
vi.mock('../../services/AuditService', () => ({
  auditService: {
    log: vi.fn(),
  },
}));

describe('EnhancedNotificationService', () => {
  let service: EnhancedNotificationService;
  const mockUserId = 'test-user-123';

  beforeEach(() => {
    service = new EnhancedNotificationService();
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('notification creation', () => {
    it('should create and store a notification', async () => {
      const notificationId = await service.sendNotification({
        type: 'notification' as const,
        channel: `user:${mockUserId}`,
        sender: {
          id: 'system',
          name: 'System',
          role: 'system'
        },
        data: {},
        priority: NotificationPriority.NORMAL,
        category: NotificationCategory.ENTRY_UPDATE,
        title: 'Test Notification',
        body: 'This is a test notification',
        metadata: {
          userId: mockUserId,
          entryId: 'entry123'
        }
      });

      expect(notificationId).toBeDefined();
      expect(notificationId).toMatch(/^notification_\d+_\w+$/);

      const notifications = await service.getUserNotifications(mockUserId);
      expect(notifications.notifications).toHaveLength(1);
      expect(notifications.notifications[0].title).toBe('Test Notification');
      expect(notifications.notifications[0].isRead).toBe(false);
    });

    it('should create bulk notifications', async () => {
      const notifications = [
        {
          type: 'notification' as const,
          channel: `user:${mockUserId}`,
          sender: { id: 'system', name: 'System', role: 'system' },
          data: {},
          priority: NotificationPriority.HIGH,
          category: NotificationCategory.PAYMENT_UPDATE,
          title: 'Payment Due',
          body: 'Your payment is due',
          metadata: { userId: mockUserId }
        },
        {
          type: 'notification' as const,
          channel: `user:${mockUserId}`,
          sender: { id: 'system', name: 'System', role: 'system' },
          data: {},
          priority: NotificationPriority.NORMAL,
          category: NotificationCategory.ENTRY_UPDATE,
          title: 'Entry Accepted',
          body: 'Your entry has been accepted',
          metadata: { userId: mockUserId }
        }
      ];

      const notificationIds = await service.sendBulkNotifications(notifications);

      expect(notificationIds).toHaveLength(2);

      const userNotifications = await service.getUserNotifications(mockUserId);
      expect(userNotifications.notifications).toHaveLength(2);
    });
  });

  describe('template-based notifications', () => {
    it('should send notification from template with variable substitution', async () => {
      const variables = {
        dogName: 'Bella',
        showName: 'Spring Agility Championship'
      };

      const notificationId = await service.sendFromTemplate(
        'entry_accepted',
        variables,
        { userId: mockUserId, channel: `user:${mockUserId}` },
        { entryId: 'entry123' }
      );

      expect(notificationId).toBeDefined();

      const notifications = await service.getUserNotifications(mockUserId);
      expect(notifications.notifications).toHaveLength(1);
      
      const notification = notifications.notifications[0];
      expect(notification.title).toBe('Entry Accepted');
      expect(notification.body).toContain('Bella');
      expect(notification.body).toContain('Spring Agility Championship');
      expect(notification.category).toBe(NotificationCategory.ENTRY_UPDATE);
    });

    it('should throw error for non-existent template', async () => {
      await expect(
        service.sendFromTemplate(
          'non_existent_template',
          {},
          { userId: mockUserId, channel: `user:${mockUserId}` }
        )
      ).rejects.toThrow('Notification template not found');
    });
  });

  describe('notification retrieval and filtering', () => {
    beforeEach(async () => {
      // Create test notifications
      const notifications = [
        {
          type: 'notification' as const,
          channel: `user:${mockUserId}`,
          sender: { id: 'system', name: 'System', role: 'system' },
          data: {},
          priority: NotificationPriority.HIGH,
          category: NotificationCategory.ENTRY_UPDATE,
          title: 'High Priority Entry',
          body: 'High priority notification',
          metadata: { userId: mockUserId }
        },
        {
          type: 'notification' as const,
          channel: `user:${mockUserId}`,
          sender: { id: 'system', name: 'System', role: 'system' },
          data: {},
          priority: NotificationPriority.NORMAL,
          category: NotificationCategory.PAYMENT_UPDATE,
          title: 'Payment Reminder',
          body: 'Payment reminder notification',
          metadata: { userId: mockUserId }
        },
        {
          type: 'notification' as const,
          channel: `user:${mockUserId}`,
          sender: { id: 'system', name: 'System', role: 'system' },
          data: {},
          priority: NotificationPriority.LOW,
          category: NotificationCategory.ANNOUNCEMENT,
          title: 'General Announcement',
          body: 'General announcement notification',
          metadata: { userId: mockUserId }
        }
      ];

      await service.sendBulkNotifications(notifications);
    });

    it('should filter notifications by category', async () => {
      const result = await service.getUserNotifications(mockUserId, {
        category: NotificationCategory.ENTRY_UPDATE
      });

      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0].category).toBe(NotificationCategory.ENTRY_UPDATE);
    });

    it('should filter notifications by priority', async () => {
      const result = await service.getUserNotifications(mockUserId, {
        priority: NotificationPriority.HIGH
      });

      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0].priority).toBe(NotificationPriority.HIGH);
    });

    it('should filter unread notifications only', async () => {
      const result = await service.getUserNotifications(mockUserId, {
        unreadOnly: true
      });

      expect(result.notifications).toHaveLength(3);
      expect(result.notifications.every(n => !n.isRead)).toBe(true);
    });

    it('should limit and paginate results', async () => {
      const result = await service.getUserNotifications(mockUserId, {
        limit: 2,
        offset: 1
      });

      expect(result.notifications).toHaveLength(2);
      expect(result.total).toBe(3);
    });
  });

  describe('notification status management', () => {
    let notificationId: string;

    beforeEach(async () => {
      notificationId = await service.sendNotification({
        type: 'notification' as const,
        channel: `user:${mockUserId}`,
        sender: { id: 'system', name: 'System', role: 'system' },
        data: {},
        priority: NotificationPriority.NORMAL,
        category: NotificationCategory.ENTRY_UPDATE,
        title: 'Test Notification',
        body: 'Test notification body',
        metadata: { userId: mockUserId }
      });
    });

    it('should mark notification as read', async () => {
      await service.markAsRead(notificationId, mockUserId);

      const notifications = await service.getUserNotifications(mockUserId);
      expect(notifications.notifications[0].isRead).toBe(true);
    });

    it('should mark all notifications as read', async () => {
      // Add another notification
      await service.sendNotification({
        type: 'notification' as const,
        channel: `user:${mockUserId}`,
        sender: { id: 'system', name: 'System', role: 'system' },
        data: {},
        priority: NotificationPriority.NORMAL,
        category: NotificationCategory.ENTRY_UPDATE,
        title: 'Another Notification',
        body: 'Another test notification',
        metadata: { userId: mockUserId }
      });

      await service.markAllAsRead(mockUserId);

      const notifications = await service.getUserNotifications(mockUserId);
      expect(notifications.notifications.every(n => n.isRead)).toBe(true);
    });

    it('should archive notification', async () => {
      await service.archiveNotification(notificationId, mockUserId);

      const notifications = await service.getUserNotifications(mockUserId);
      expect(notifications.notifications).toHaveLength(0);

      const archivedNotifications = await service.getUserNotifications(mockUserId, {
        includeArchived: true
      });
      expect(archivedNotifications.notifications).toHaveLength(1);
      expect(archivedNotifications.notifications[0].isArchived).toBe(true);
    });

    it('should delete notification', async () => {
      await service.deleteNotification(notificationId, mockUserId);

      const notifications = await service.getUserNotifications(mockUserId, {
        includeArchived: true
      });
      expect(notifications.notifications).toHaveLength(0);
    });
  });

  describe('unread count', () => {
    beforeEach(async () => {
      // Create mix of read and unread notifications
      const notificationId1 = await service.sendNotification({
        type: 'notification' as const,
        channel: `user:${mockUserId}`,
        sender: { id: 'system', name: 'System', role: 'system' },
        data: {},
        priority: NotificationPriority.NORMAL,
        category: NotificationCategory.ENTRY_UPDATE,
        title: 'Unread Notification 1',
        body: 'First unread notification',
        metadata: { userId: mockUserId }
      });

      await service.sendNotification({
        type: 'notification' as const,
        channel: `user:${mockUserId}`,
        sender: { id: 'system', name: 'System', role: 'system' },
        data: {},
        priority: NotificationPriority.NORMAL,
        category: NotificationCategory.PAYMENT_UPDATE,
        title: 'Unread Notification 2',
        body: 'Second unread notification',
        metadata: { userId: mockUserId }
      });

      // Mark one as read
      await service.markAsRead(notificationId1, mockUserId);
    });

    it('should return correct unread count', async () => {
      const unreadCount = await service.getUnreadCount(mockUserId);
      expect(unreadCount).toBe(1);
    });

    it('should return unread count by category', async () => {
      const unreadCount = await service.getUnreadCount(mockUserId, NotificationCategory.PAYMENT_UPDATE);
      expect(unreadCount).toBe(1);

      const entryUpdateCount = await service.getUnreadCount(mockUserId, NotificationCategory.ENTRY_UPDATE);
      expect(entryUpdateCount).toBe(0);
    });
  });

  describe('user preferences', () => {
    it('should update user preferences', async () => {
      const preferences = {
        categories: {
          [NotificationCategory.ENTRY_UPDATE]: {
            enabled: false,
            channels: [NotificationChannel.EMAIL],
            minPriority: NotificationPriority.HIGH
          }
        }
      };

      await service.updatePreferences(mockUserId, preferences);

      const userPreferences = await service.getUserPreferences(mockUserId);
      expect(userPreferences.categories[NotificationCategory.ENTRY_UPDATE].enabled).toBe(false);
      expect(userPreferences.categories[NotificationCategory.ENTRY_UPDATE].channels).toContain(NotificationChannel.EMAIL);
    });

    it('should return default preferences for new user', async () => {
      const preferences = await service.getUserPreferences('new-user');
      
      expect(preferences.userId).toBe('new-user');
      expect(preferences.categories[NotificationCategory.ENTRY_UPDATE].enabled).toBe(true);
      expect(preferences.categories[NotificationCategory.ENTRY_UPDATE].channels).toContain(NotificationChannel.IN_APP);
      expect(preferences.quietHours.enabled).toBe(false);
    });
  });

  describe('scheduled reminders', () => {
    it('should schedule future reminder', async () => {
      const futureTime = new Date(Date.now() + 60000); // 1 minute from now

      const notificationId = await service.scheduleReminder({
        type: 'notification' as const,
        channel: `user:${mockUserId}`,
        sender: { id: 'system', name: 'System', role: 'system' },
        data: {},
        priority: NotificationPriority.NORMAL,
        title: 'Reminder',
        body: 'This is a scheduled reminder',
        metadata: { userId: mockUserId }
      }, futureTime);

      expect(notificationId).toBeDefined();

      const notifications = await service.getUserNotifications(mockUserId);
      expect(notifications.notifications).toHaveLength(1);
      expect(notifications.notifications[0].category).toBe(NotificationCategory.REMINDER);
    });

    it('should deliver past reminder immediately', async () => {
      const pastTime = new Date(Date.now() - 60000); // 1 minute ago

      const notificationId = await service.scheduleReminder({
        type: 'notification' as const,
        channel: `user:${mockUserId}`,
        sender: { id: 'system', name: 'System', role: 'system' },
        data: {},
        priority: NotificationPriority.NORMAL,
        title: 'Past Reminder',
        body: 'This reminder was scheduled for the past',
        metadata: { userId: mockUserId }
      }, pastTime);

      expect(notificationId).toBeDefined();

      const notifications = await service.getUserNotifications(mockUserId);
      expect(notifications.notifications).toHaveLength(1);
    });
  });

  describe('persistence', () => {
    it('should persist notifications to localStorage', async () => {
      await service.sendNotification({
        type: 'notification' as const,
        channel: `user:${mockUserId}`,
        sender: { id: 'system', name: 'System', role: 'system' },
        data: {},
        priority: NotificationPriority.NORMAL,
        category: NotificationCategory.ENTRY_UPDATE,
        title: 'Persistent Notification',
        body: 'This notification should be persisted',
        metadata: { userId: mockUserId }
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'enhanced_notifications',
        expect.stringContaining('Persistent Notification')
      );
    });

    it('should persist preferences to localStorage', async () => {
      const preferences = {
        quietHours: {
          enabled: true,
          start: '22:00',
          end: '08:00'
        }
      };

      await service.updatePreferences(mockUserId, preferences);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'notification_preferences',
        expect.stringContaining(mockUserId)
      );
    });
  });

  describe('error handling', () => {
    it('should handle localStorage errors gracefully', () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error('LocalStorage error');
      });

      // Should not throw when creating service with localStorage errors
      expect(() => new EnhancedNotificationService()).not.toThrow();
    });

    it('should handle corrupted localStorage data', () => {
      localStorageMock.getItem.mockReturnValue('invalid json');

      // Should not throw when creating service with corrupted data
      expect(() => new EnhancedNotificationService()).not.toThrow();
    });
  });
});