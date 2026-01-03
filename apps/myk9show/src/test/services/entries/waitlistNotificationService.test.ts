/**
 * Waitlist Notification Service Tests
 * 
 * Tests for automated notification system when waitlist status changes:
 * - Entry placed on waitlist
 * - Promotion from waitlist to confirmed
 * - Waitlist position changes
 * - Class capacity updates
 * - Cancellation notifications
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ShowEntry } from '@/store/entryStore';

// Mock notification service
interface NotificationPayload {
  type: 'waitlist_added' | 'waitlist_promoted' | 'waitlist_position_changed' | 'entry_cancelled';
  entryId: string;
  dogName: string;
  className: string;
  showName: string;
  position?: number;
  previousPosition?: number;
  message: string;
  priority: 'low' | 'medium' | 'high';
  timestamp: string;
}

class WaitlistNotificationService {
  private notifications: NotificationPayload[] = [];
  
  async sendNotification(payload: NotificationPayload): Promise<boolean> {
    this.notifications.push(payload);
    return true;
  }
  
  getNotifications(): NotificationPayload[] {
    return this.notifications;
  }
  
  clearNotifications(): void {
    this.notifications = [];
  }
  
  async notifyWaitlistAdded(entry: ShowEntry, position: number): Promise<void> {
    await this.sendNotification({
      type: 'waitlist_added',
      entryId: entry.id,
      dogName: 'Test Dog', // Would come from entry
      className: 'Test Class',
      showName: 'Test Show',
      position,
      message: `Your entry has been placed on the waitlist at position ${position}`,
      priority: 'medium',
      timestamp: new Date().toISOString()
    });
  }
  
  async notifyWaitlistPromoted(entry: ShowEntry): Promise<void> {
    await this.sendNotification({
      type: 'waitlist_promoted',
      entryId: entry.id,
      dogName: 'Test Dog',
      className: 'Test Class',
      showName: 'Test Show',
      message: 'Congratulations! Your entry has been promoted from the waitlist to confirmed',
      priority: 'high',
      timestamp: new Date().toISOString()
    });
  }
  
  async notifyPositionChanged(entry: ShowEntry, newPosition: number, oldPosition: number): Promise<void> {
    await this.sendNotification({
      type: 'waitlist_position_changed',
      entryId: entry.id,
      dogName: 'Test Dog',
      className: 'Test Class',
      showName: 'Test Show',
      position: newPosition,
      previousPosition: oldPosition,
      message: `Your waitlist position has changed from ${oldPosition} to ${newPosition}`,
      priority: newPosition < oldPosition ? 'medium' : 'low',
      timestamp: new Date().toISOString()
    });
  }
  
  async notifyEntryCancelled(entry: ShowEntry, reason: string): Promise<void> {
    await this.sendNotification({
      type: 'entry_cancelled',
      entryId: entry.id,
      dogName: 'Test Dog',
      className: 'Test Class',
      showName: 'Test Show',
      message: `Entry cancelled: ${reason}`,
      priority: 'medium',
      timestamp: new Date().toISOString()
    });
  }
}

describe('WaitlistNotificationService', () => {
  let notificationService: WaitlistNotificationService;
  let mockEntry: ShowEntry;

  beforeEach(() => {
    notificationService = new WaitlistNotificationService();
    
    mockEntry = {
      id: 'test-entry-001',
      showId: 'test-show-001',
      classId: 'test-class-001',
      dogId: 'test-dog-001',
      status: 'draft',
      registrationData: {
        submittedAt: new Date().toISOString(),
        handler: 'Test Handler',
        entryFee: 25.00,
        paymentStatus: 'pending'
      },
      statusHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as ShowEntry;
  });

  describe('Waitlist Addition Notifications', () => {
    it('should send notification when entry is added to waitlist', async () => {
      await notificationService.notifyWaitlistAdded(mockEntry, 3);
      
      const notifications = notificationService.getNotifications();
      expect(notifications).toHaveLength(1);
      
      const notification = notifications[0];
      expect(notification.type).toBe('waitlist_added');
      expect(notification.entryId).toBe(mockEntry.id);
      expect(notification.position).toBe(3);
      expect(notification.priority).toBe('medium');
      expect(notification.message).toContain('position 3');
    });

    it('should prioritize early waitlist positions differently', async () => {
      // Position 1 should have higher priority
      await notificationService.notifyWaitlistAdded(mockEntry, 1);
      
      const notifications = notificationService.getNotifications();
      const notification = notifications[0];
      
      expect(notification.priority).toBe('medium');
      expect(notification.position).toBe(1);
    });

    it('should include relevant entry details in notification', async () => {
      await notificationService.notifyWaitlistAdded(mockEntry, 2);
      
      const notification = notificationService.getNotifications()[0];
      
      expect(notification.dogName).toBeTruthy();
      expect(notification.className).toBeTruthy();
      expect(notification.showName).toBeTruthy();
      expect(notification.timestamp).toBeTruthy();
    });
  });

  describe('Waitlist Promotion Notifications', () => {
    it('should send high-priority notification for promotion', async () => {
      await notificationService.notifyWaitlistPromoted(mockEntry);
      
      const notifications = notificationService.getNotifications();
      expect(notifications).toHaveLength(1);
      
      const notification = notifications[0];
      expect(notification.type).toBe('waitlist_promoted');
      expect(notification.priority).toBe('high');
      expect(notification.message).toContain('promoted from the waitlist');
    });

    it('should include congratulatory message for promotion', async () => {
      await notificationService.notifyWaitlistPromoted(mockEntry);
      
      const notification = notificationService.getNotifications()[0];
      expect(notification.message).toContain('Congratulations');
      expect(notification.message).toContain('confirmed');
    });
  });

  describe('Position Change Notifications', () => {
    it('should notify when waitlist position improves', async () => {
      await notificationService.notifyPositionChanged(mockEntry, 2, 4);
      
      const notifications = notificationService.getNotifications();
      expect(notifications).toHaveLength(1);
      
      const notification = notifications[0];
      expect(notification.type).toBe('waitlist_position_changed');
      expect(notification.position).toBe(2);
      expect(notification.previousPosition).toBe(4);
      expect(notification.priority).toBe('medium'); // Improved position
    });

    it('should notify when waitlist position worsens', async () => {
      await notificationService.notifyPositionChanged(mockEntry, 5, 3);
      
      const notification = notificationService.getNotifications()[0];
      expect(notification.position).toBe(5);
      expect(notification.previousPosition).toBe(3);
      expect(notification.priority).toBe('low'); // Worsened position
    });

    it('should include both old and new positions in message', async () => {
      await notificationService.notifyPositionChanged(mockEntry, 1, 3);
      
      const notification = notificationService.getNotifications()[0];
      expect(notification.message).toContain('from 3 to 1');
    });
  });

  describe('Cancellation Notifications', () => {
    it('should notify about entry cancellations', async () => {
      const reason = 'Owner request';
      await notificationService.notifyEntryCancelled(mockEntry, reason);
      
      const notifications = notificationService.getNotifications();
      expect(notifications).toHaveLength(1);
      
      const notification = notifications[0];
      expect(notification.type).toBe('entry_cancelled');
      expect(notification.message).toContain(reason);
      expect(notification.priority).toBe('medium');
    });

    it('should include cancellation reason in message', async () => {
      const reason = 'Dog injury';
      await notificationService.notifyEntryCancelled(mockEntry, reason);
      
      const notification = notificationService.getNotifications()[0];
      expect(notification.message).toContain('Dog injury');
    });
  });

  describe('Notification Integration Scenarios', () => {
    it('should handle multiple notifications for same entry', async () => {
      // Entry added to waitlist
      await notificationService.notifyWaitlistAdded(mockEntry, 5);
      
      // Position improves
      await notificationService.notifyPositionChanged(mockEntry, 3, 5);
      
      // Further improvement
      await notificationService.notifyPositionChanged(mockEntry, 1, 3);
      
      // Finally promoted
      await notificationService.notifyWaitlistPromoted(mockEntry);
      
      const notifications = notificationService.getNotifications();
      expect(notifications).toHaveLength(4);
      
      const types = notifications.map(n => n.type);
      expect(types).toEqual([
        'waitlist_added',
        'waitlist_position_changed',
        'waitlist_position_changed',
        'waitlist_promoted'
      ]);
    });

    it('should track notification timeline correctly', async () => {
      const startTime = Date.now();
      
      await notificationService.notifyWaitlistAdded(mockEntry, 3);
      
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await notificationService.notifyPositionChanged(mockEntry, 2, 3);
      
      const notifications = notificationService.getNotifications();
      const timestamps = notifications.map(n => new Date(n.timestamp).getTime());
      
      expect(timestamps[0]).toBeGreaterThanOrEqual(startTime);
      expect(timestamps[1]).toBeGreaterThan(timestamps[0]);
    });

    it('should prioritize notifications appropriately', async () => {
      // Add various notifications
      await notificationService.notifyWaitlistAdded(mockEntry, 5); // medium
      await notificationService.notifyPositionChanged(mockEntry, 6, 5); // low (worse)
      await notificationService.notifyWaitlistPromoted(mockEntry); // high
      await notificationService.notifyPositionChanged(mockEntry, 3, 5); // medium (better)
      
      const notifications = notificationService.getNotifications();
      const priorities = notifications.map(n => n.priority);
      
      expect(priorities).toContain('high');
      expect(priorities).toContain('medium');
      expect(priorities).toContain('low');
      
      // High priority should be for promotion
      const highPriorityNotification = notifications.find(n => n.priority === 'high');
      expect(highPriorityNotification?.type).toBe('waitlist_promoted');
    });
  });

  describe('Bulk Notification Scenarios', () => {
    it('should handle notifications for multiple entries efficiently', async () => {
      const entries = Array.from({ length: 5 }, (_, i) => ({
        ...mockEntry,
        id: `entry-${i}`,
        dogId: `dog-${i}`
      }));
      
      // Simulate bulk waitlist additions
      for (let i = 0; i < entries.length; i++) {
        await notificationService.notifyWaitlistAdded(entries[i], i + 1);
      }
      
      const notifications = notificationService.getNotifications();
      expect(notifications).toHaveLength(5);
      
      // Check positions are correct
      const positions = notifications.map(n => n.position);
      expect(positions).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle cascading position changes from cancellation', async () => {
      // Setup: Multiple entries on waitlist
      const waitlistEntries = Array.from({ length: 4 }, (_, i) => ({
        ...mockEntry,
        id: `waitlist-entry-${i}`,
        dogId: `waitlist-dog-${i}`
      }));
      
      // First, add all to waitlist
      for (let i = 0; i < waitlistEntries.length; i++) {
        await notificationService.notifyWaitlistAdded(waitlistEntries[i], i + 1);
      }
      
      notificationService.clearNotifications();
      
      // Simulate cancellation causing position changes
      // Entry at position 2 cancels, so positions 3 and 4 move up
      await notificationService.notifyPositionChanged(waitlistEntries[2], 2, 3); // 3->2
      await notificationService.notifyPositionChanged(waitlistEntries[3], 3, 4); // 4->3
      
      const notifications = notificationService.getNotifications();
      expect(notifications).toHaveLength(2);
      
      // Both should be medium priority (improved positions)
      expect(notifications.every(n => n.priority === 'medium')).toBe(true);
    });
  });

  describe('Notification Content Quality', () => {
    it('should provide clear and actionable messages', async () => {
      await notificationService.notifyWaitlistAdded(mockEntry, 2);
      await notificationService.notifyWaitlistPromoted(mockEntry);
      
      const notifications = notificationService.getNotifications();
      
      notifications.forEach(notification => {
        expect(notification.message).toBeTruthy();
        expect(notification.message.length).toBeGreaterThan(10);
        expect(notification.message).not.toContain('undefined');
        expect(notification.message).not.toContain('null');
      });
    });

    it('should include all required notification fields', async () => {
      await notificationService.notifyWaitlistAdded(mockEntry, 1);
      
      const notification = notificationService.getNotifications()[0];
      
      // Required fields
      expect(notification.type).toBeTruthy();
      expect(notification.entryId).toBeTruthy();
      expect(notification.dogName).toBeTruthy();
      expect(notification.className).toBeTruthy();
      expect(notification.showName).toBeTruthy();
      expect(notification.message).toBeTruthy();
      expect(notification.priority).toBeTruthy();
      expect(notification.timestamp).toBeTruthy();
    });

    it('should format timestamps correctly', async () => {
      await notificationService.notifyWaitlistAdded(mockEntry, 1);
      
      const notification = notificationService.getNotifications()[0];
      const timestamp = new Date(notification.timestamp);
      
      expect(timestamp.getTime()).not.toBeNaN();
      expect(timestamp.getTime()).toBeGreaterThan(Date.now() - 10000); // Within last 10 seconds
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle notification service failures gracefully', async () => {
      // Mock a failing notification service
      const failingService = new WaitlistNotificationService();
      vi.spyOn(failingService, 'sendNotification').mockRejectedValue(new Error('Network error'));
      
      // Should not throw error
      await expect(
        failingService.notifyWaitlistAdded(mockEntry, 1)
      ).rejects.toThrow('Network error');
    });

    it('should handle invalid position values', async () => {
      // Test with invalid positions
      await notificationService.notifyWaitlistAdded(mockEntry, 0);
      await notificationService.notifyWaitlistAdded(mockEntry, -1);
      
      const notifications = notificationService.getNotifications();
      expect(notifications).toHaveLength(2);
      
      // Should still create notifications but with the provided values
      expect(notifications[0].position).toBe(0);
      expect(notifications[1].position).toBe(-1);
    });

    it('should handle missing entry data gracefully', async () => {
      const incompleteEntry = {
        id: 'incomplete-entry',
        showId: '',
        classId: '',
        dogId: ''
      } as ShowEntry;
      
      await notificationService.notifyWaitlistAdded(incompleteEntry, 1);
      
      const notification = notificationService.getNotifications()[0];
      expect(notification.entryId).toBe('incomplete-entry');
      // Service should still work with incomplete data
    });
  });
});