/**
 * Tests for Subscription Cleanup Service
 *
 * Comprehensive tests for subscription lifecycle management
 * and memory leak prevention.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { subscriptionCleanup } from './subscriptionCleanup';
import type { SubscriptionInfo } from './subscriptionCleanup';

// Mock dependencies
vi.mock('./syncManager', () => ({
  syncManager: {
    unsubscribeAll: vi.fn()
  }
}));

// Create stable mock functions to track calls
const mockDisableRealtimeAnnouncement = vi.fn();
const mockDisableRealtimeNationals = vi.fn();

vi.mock('../stores/announcementStore', () => ({
  useAnnouncementStore: {
    getState: vi.fn(() => ({
      realtimeChannel: { unsubscribe: vi.fn() },
      disableRealtime: mockDisableRealtimeAnnouncement
    }))
  }
}));

vi.mock('../stores/nationalsStore', () => ({
  useNationalsStore: {
    getState: vi.fn(() => ({
      realtimeChannel: { unsubscribe: vi.fn() },
      disableRealtime: mockDisableRealtimeNationals
    }))
  }
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('SubscriptionCleanupService', () => {
  beforeEach(() => {
    // Clear all subscriptions before each test
    subscriptionCleanup['subscriptions'].clear();
    subscriptionCleanup['cleanupHistory'] = [];
    vi.clearAllMocks();
    mockDisableRealtimeAnnouncement.mockClear();
    mockDisableRealtimeNationals.mockClear();
  });

  describe('register', () => {
    it('should register a new subscription', () => {
      // Arrange
      const key = 'test-sub-1';
      const type: SubscriptionInfo['type'] = 'entry';

      // Act
      subscriptionCleanup.register(key, type);

      // Assert
      expect(subscriptionCleanup.getActiveCount()).toBe(1);
      const subscriptions = subscriptionCleanup.getAll();
      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0]).toMatchObject({
        key,
        type,
        active: true
      });
      expect(subscriptions[0].createdAt).toBeInstanceOf(Date);
    });

    it('should register subscription with license key', () => {
      // Arrange
      const key = 'test-sub-2';
      const type: SubscriptionInfo['type'] = 'sync';
      const licenseKey = 'LICENSE-123';

      // Act
      subscriptionCleanup.register(key, type, licenseKey);

      // Assert
      const subscriptions = subscriptionCleanup.getAll();
      expect(subscriptions[0].licenseKey).toBe(licenseKey);
    });

    it('should warn when registering duplicate subscription', async () => {
      // Arrange
      const { logger } = await import('@/utils/logger');
      const key = 'duplicate-sub';

      // Act
      subscriptionCleanup.register(key, 'entry');
      subscriptionCleanup.register(key, 'entry'); // Duplicate

      // Assert
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('already registered')
      );
    });

    it('should handle multiple subscription types', () => {
      // Arrange & Act
      subscriptionCleanup.register('sub-1', 'announcement');
      subscriptionCleanup.register('sub-2', 'nationals');
      subscriptionCleanup.register('sub-3', 'entry');
      subscriptionCleanup.register('sub-4', 'sync');
      subscriptionCleanup.register('sub-5', 'other');

      // Assert
      expect(subscriptionCleanup.getActiveCount()).toBe(5);
      expect(subscriptionCleanup.getByType('announcement')).toHaveLength(1);
      expect(subscriptionCleanup.getByType('nationals')).toHaveLength(1);
      expect(subscriptionCleanup.getByType('entry')).toHaveLength(1);
      expect(subscriptionCleanup.getByType('sync')).toHaveLength(1);
      expect(subscriptionCleanup.getByType('other')).toHaveLength(1);
    });
  });

  describe('unregister', () => {
    it('should unregister an existing subscription', () => {
      // Arrange
      const key = 'test-sub';
      subscriptionCleanup.register(key, 'entry');
      expect(subscriptionCleanup.getActiveCount()).toBe(1);

      // Act
      subscriptionCleanup.unregister(key);

      // Assert
      expect(subscriptionCleanup.getActiveCount()).toBe(0);
      expect(subscriptionCleanup.getAll()).toHaveLength(0);
    });

    it('should handle unregistering non-existent subscription', () => {
      // Arrange
      const key = 'non-existent';

      // Act - Should not throw
      expect(() => {
        subscriptionCleanup.unregister(key);
      }).not.toThrow();

      // Assert
      expect(subscriptionCleanup.getActiveCount()).toBe(0);
    });

    it('should mark subscription as inactive before removal', () => {
      // Arrange
      const key = 'test-sub';
      subscriptionCleanup.register(key, 'entry');

      // Get reference to the internal map
      const subscriptions = subscriptionCleanup['subscriptions'];
      const subBefore = subscriptions.get(key);
      expect(subBefore?.active).toBe(true);

      // Act
      subscriptionCleanup.unregister(key);

      // Assert
      // Subscription should be removed from map
      expect(subscriptions.has(key)).toBe(false);
    });
  });

  describe('cleanupByLicenseKey', () => {
    it('should cleanup subscriptions for specific license key', () => {
      // Arrange
      const licenseKey = 'LICENSE-ABC';
      subscriptionCleanup.register('sub-1', 'entry', licenseKey);
      subscriptionCleanup.register('sub-2', 'entry', licenseKey);
      subscriptionCleanup.register('sub-3', 'entry', 'OTHER-LICENSE');

      // Act
      const count = subscriptionCleanup.cleanupByLicenseKey(licenseKey);

      // Assert
      expect(count).toBe(2);
      expect(subscriptionCleanup.getActiveCount()).toBe(1);
      const remaining = subscriptionCleanup.getAll();
      expect(remaining[0].licenseKey).toBe('OTHER-LICENSE');
    });

    it('should return 0 when no subscriptions match license key', () => {
      // Arrange
      subscriptionCleanup.register('sub-1', 'entry', 'LICENSE-A');
      subscriptionCleanup.register('sub-2', 'entry', 'LICENSE-B');

      // Act
      const count = subscriptionCleanup.cleanupByLicenseKey('LICENSE-C');

      // Assert
      expect(count).toBe(0);
      expect(subscriptionCleanup.getActiveCount()).toBe(2);
    });

    it('should handle subscriptions without license keys', () => {
      // Arrange
      subscriptionCleanup.register('sub-1', 'entry'); // No license key
      subscriptionCleanup.register('sub-2', 'entry', 'LICENSE-A');

      // Act
      const count = subscriptionCleanup.cleanupByLicenseKey('LICENSE-A');

      // Assert
      expect(count).toBe(1);
      expect(subscriptionCleanup.getActiveCount()).toBe(1);
    });
  });

  describe('cleanupAll', () => {
    it('should cleanup all subscriptions', async () => {
      // Arrange
      const { syncManager } = await import('./syncManager');

      subscriptionCleanup.register('sub-1', 'entry');
      subscriptionCleanup.register('sub-2', 'announcement');
      subscriptionCleanup.register('sub-3', 'nationals');

      // Act
      const count = subscriptionCleanup.cleanupAll();

      // Assert
      expect(count).toBe(3);
      expect(subscriptionCleanup.getActiveCount()).toBe(0);
      expect(syncManager.unsubscribeAll).toHaveBeenCalled();
      expect(mockDisableRealtimeAnnouncement).toHaveBeenCalled();
      expect(mockDisableRealtimeNationals).toHaveBeenCalled();
    });

    it('should record cleanup in history', () => {
      // Arrange
      subscriptionCleanup.register('sub-1', 'entry');
      subscriptionCleanup.register('sub-2', 'sync');

      // Act
      subscriptionCleanup.cleanupAll();

      // Assert
      const history = subscriptionCleanup.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].count).toBe(2);
      expect(history[0].timestamp).toBeInstanceOf(Date);
    });

    it('should handle cleanup when no subscriptions exist', async () => {
      // Arrange
      const { syncManager } = await import('./syncManager');

      // Act
      const count = subscriptionCleanup.cleanupAll();

      // Assert
      expect(count).toBe(0);
      expect(syncManager.unsubscribeAll).toHaveBeenCalled();
    });

    it('should handle stores without realtime channels', async () => {
      // Arrange
      const { useAnnouncementStore } = await import('../stores/announcementStore');
      const { useNationalsStore } = await import('../stores/nationalsStore');

      // Mock stores without channels
      (useAnnouncementStore.getState as Mock).mockReturnValueOnce({
        realtimeChannel: null,
        disableRealtime: vi.fn()
      });
      (useNationalsStore.getState as Mock).mockReturnValueOnce({
        realtimeChannel: null,
        disableRealtime: vi.fn()
      });

      subscriptionCleanup.register('sub-1', 'entry');

      // Act - Should not throw
      expect(() => {
        subscriptionCleanup.cleanupAll();
      }).not.toThrow();

      // Assert
      expect(subscriptionCleanup.getActiveCount()).toBe(0);
    });
  });

  describe('cleanupOnRouteChange', () => {
    it('should cleanup when routes are in different contexts', () => {
      // Arrange
      subscriptionCleanup.register('sub-1', 'entry');
      subscriptionCleanup.register('sub-2', 'entry');

      // Make subscriptions stale (older than 30 minutes)
      const oldDate = new Date(Date.now() - 31 * 60 * 1000);
      subscriptionCleanup['subscriptions'].forEach(sub => {
        sub.createdAt = oldDate;
      });

      // Act
      const count = subscriptionCleanup.cleanupOnRouteChange('/classes/123', '/admin/settings');

      // Assert
      expect(count).toBe(2);
      expect(subscriptionCleanup.getActiveCount()).toBe(0);
    });

    it('should not cleanup when routes are in same context', () => {
      // Arrange
      subscriptionCleanup.register('sub-1', 'entry');
      subscriptionCleanup.register('sub-2', 'entry');

      // Act
      const count = subscriptionCleanup.cleanupOnRouteChange(
        '/classes/123/entry/456',
        '/classes/123/entry/789'
      );

      // Assert
      expect(count).toBe(0);
      expect(subscriptionCleanup.getActiveCount()).toBe(2);
    });

    it('should record cleanup with route in history', () => {
      // Arrange
      subscriptionCleanup.register('sub-1', 'entry');
      const oldDate = new Date(Date.now() - 31 * 60 * 1000);
      subscriptionCleanup['subscriptions'].forEach(sub => {
        sub.createdAt = oldDate;
      });

      // Act
      const toRoute = '/admin/settings';
      subscriptionCleanup.cleanupOnRouteChange('/classes/123', toRoute);

      // Assert
      const history = subscriptionCleanup.getHistory();
      expect(history[0].route).toBe(toRoute);
    });

    it('should detect same context for nested routes', () => {
      // Arrange
      subscriptionCleanup.register('sub-1', 'entry');

      // Act
      const count = subscriptionCleanup.cleanupOnRouteChange(
        '/classes/123/entries',
        '/classes/456/entries'
      );

      // Assert
      // Base route is /classes/[id] for both, so same context
      expect(count).toBe(0);
    });
  });

  describe('getActiveCount', () => {
    it('should return 0 for no subscriptions', () => {
      expect(subscriptionCleanup.getActiveCount()).toBe(0);
    });

    it('should return correct count', () => {
      // Arrange & Act
      subscriptionCleanup.register('sub-1', 'entry');
      subscriptionCleanup.register('sub-2', 'sync');
      subscriptionCleanup.register('sub-3', 'announcement');

      // Assert
      expect(subscriptionCleanup.getActiveCount()).toBe(3);
    });

    it('should only count active subscriptions', () => {
      // Arrange
      subscriptionCleanup.register('sub-1', 'entry');
      subscriptionCleanup.register('sub-2', 'entry');
      subscriptionCleanup.register('sub-3', 'entry');

      // Act
      subscriptionCleanup.unregister('sub-2');

      // Assert
      expect(subscriptionCleanup.getActiveCount()).toBe(2);
    });
  });

  describe('getByType', () => {
    it('should return subscriptions of specific type', () => {
      // Arrange
      subscriptionCleanup.register('sub-1', 'entry');
      subscriptionCleanup.register('sub-2', 'entry');
      subscriptionCleanup.register('sub-3', 'announcement');
      subscriptionCleanup.register('sub-4', 'sync');

      // Act
      const entrySubscriptions = subscriptionCleanup.getByType('entry');

      // Assert
      expect(entrySubscriptions).toHaveLength(2);
      expect(entrySubscriptions.every(s => s.type === 'entry')).toBe(true);
    });

    it('should return empty array for type with no subscriptions', () => {
      // Arrange
      subscriptionCleanup.register('sub-1', 'entry');

      // Act
      const nationalsSubscriptions = subscriptionCleanup.getByType('nationals');

      // Assert
      expect(nationalsSubscriptions).toHaveLength(0);
    });

    it('should only return active subscriptions', () => {
      // Arrange
      subscriptionCleanup.register('sub-1', 'entry');
      subscriptionCleanup.register('sub-2', 'entry');

      // Act
      subscriptionCleanup.unregister('sub-1');
      const activeEntries = subscriptionCleanup.getByType('entry');

      // Assert
      expect(activeEntries).toHaveLength(1);
      expect(activeEntries[0].key).toBe('sub-2');
    });
  });

  describe('getAll', () => {
    it('should return all active subscriptions', () => {
      // Arrange
      subscriptionCleanup.register('sub-1', 'entry');
      subscriptionCleanup.register('sub-2', 'announcement');
      subscriptionCleanup.register('sub-3', 'sync');

      // Act
      const all = subscriptionCleanup.getAll();

      // Assert
      expect(all).toHaveLength(3);
      expect(all.every(s => s.active)).toBe(true);
    });

    it('should return empty array when no subscriptions', () => {
      expect(subscriptionCleanup.getAll()).toHaveLength(0);
    });
  });

  describe('getHistory', () => {
    it('should return cleanup history', () => {
      // Arrange
      subscriptionCleanup.register('sub-1', 'entry');
      subscriptionCleanup.cleanupAll();

      // Act
      const history = subscriptionCleanup.getHistory();

      // Assert
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        count: 1,
        timestamp: expect.any(Date)
      });
    });

    it('should limit history to maxHistorySize', () => {
      // Arrange
      const maxSize = 50;

      // Act - Create more than maxHistorySize cleanups
      for (let i = 0; i < maxSize + 10; i++) {
        subscriptionCleanup.register(`sub-${i}`, 'entry');
        subscriptionCleanup.cleanupAll();
      }

      // Assert
      const history = subscriptionCleanup.getHistory();
      expect(history.length).toBeLessThanOrEqual(maxSize);
    });

    it('should return copy of history array', () => {
      // Arrange
      subscriptionCleanup.register('sub-1', 'entry');
      subscriptionCleanup.cleanupAll();

      // Act
      const history1 = subscriptionCleanup.getHistory();
      const history2 = subscriptionCleanup.getHistory();

      // Assert
      expect(history1).toEqual(history2);
      expect(history1).not.toBe(history2); // Different array instances
    });
  });

  describe('checkForLeaks', () => {
    it('should detect no leaks with few subscriptions', () => {
      // Arrange
      subscriptionCleanup.register('sub-1', 'entry');
      subscriptionCleanup.register('sub-2', 'entry');

      // Act
      const result = subscriptionCleanup.checkForLeaks();

      // Assert
      expect(result.hasLeaks).toBe(false);
      expect(result.count).toBe(2);
      expect(result.oldestAge).toBe(0);
      expect(result.details).toHaveLength(0);
    });

    it('should detect leaks with too many subscriptions', async () => {
      // Arrange
      const { logger } = await import('@/utils/logger');

      // Create more than leak threshold (10)
      for (let i = 0; i < 15; i++) {
        subscriptionCleanup.register(`sub-${i}`, 'entry');
      }

      // Act
      const result = subscriptionCleanup.checkForLeaks();

      // Assert
      expect(result.hasLeaks).toBe(true);
      expect(result.count).toBe(15);
      expect(result.details).toHaveLength(15);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('subscription leaks detected')
      );
    });

    it('should detect leaks with old subscriptions', async () => {
      // Arrange
      const { logger } = await import('@/utils/logger');

      // Create 6 old subscriptions (threshold is 5)
      for (let i = 0; i < 6; i++) {
        subscriptionCleanup.register(`sub-${i}`, 'entry');
      }

      // Make them old (>1 hour)
      const oldDate = new Date(Date.now() - 61 * 60 * 1000);
      subscriptionCleanup['subscriptions'].forEach(sub => {
        sub.createdAt = oldDate;
      });

      // Act
      const result = subscriptionCleanup.checkForLeaks();

      // Assert
      expect(result.hasLeaks).toBe(true);
      expect(result.oldestAge).toBeGreaterThan(60); // Minutes
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should calculate oldest age correctly', () => {
      // Arrange
      const now = Date.now();
      subscriptionCleanup.register('old-sub', 'entry');
      subscriptionCleanup.register('new-sub', 'entry');

      // Make one subscription old
      const subscriptions = subscriptionCleanup['subscriptions'];
      const oldSub = subscriptions.get('old-sub')!;
      oldSub.createdAt = new Date(now - 90 * 60 * 1000); // 90 minutes ago

      // Act
      const result = subscriptionCleanup.checkForLeaks();

      // Assert
      expect(result.oldestAge).toBeGreaterThanOrEqual(89); // ~90 minutes
      expect(result.oldestAge).toBeLessThanOrEqual(91);
    });
  });

  describe('generateHealthReport', () => {
    it('should generate report with no subscriptions', () => {
      // Act
      const report = subscriptionCleanup.generateHealthReport();

      // Assert
      expect(report).toMatchObject({
        activeCount: 0,
        byType: {},
        oldestSubscription: null,
        recentCleanups: 0,
        averageCleanupSize: 0
      });
    });

    it('should count subscriptions by type', () => {
      // Arrange
      subscriptionCleanup.register('sub-1', 'entry');
      subscriptionCleanup.register('sub-2', 'entry');
      subscriptionCleanup.register('sub-3', 'announcement');
      subscriptionCleanup.register('sub-4', 'sync');
      subscriptionCleanup.register('sub-5', 'sync');
      subscriptionCleanup.register('sub-6', 'sync');

      // Act
      const report = subscriptionCleanup.generateHealthReport();

      // Assert
      expect(report.activeCount).toBe(6);
      expect(report.byType).toEqual({
        entry: 2,
        announcement: 1,
        sync: 3
      });
    });

    it('should identify oldest subscription', () => {
      // Arrange
      const now = Date.now();
      subscriptionCleanup.register('new-sub', 'entry');
      subscriptionCleanup.register('old-sub', 'entry');

      // Make one old
      const subscriptions = subscriptionCleanup['subscriptions'];
      const oldSub = subscriptions.get('old-sub')!;
      oldSub.createdAt = new Date(now - 45 * 60 * 1000); // 45 minutes ago

      // Act
      const report = subscriptionCleanup.generateHealthReport();

      // Assert
      expect(report.oldestSubscription).toMatchObject({
        key: 'old-sub',
        ageMinutes: expect.any(Number)
      });
      expect(report.oldestSubscription!.ageMinutes).toBeGreaterThanOrEqual(44);
      expect(report.oldestSubscription!.ageMinutes).toBeLessThanOrEqual(46);
    });

    it('should count recent cleanups (last hour)', () => {
      // Arrange
      const now = Date.now();

      // Add some subscriptions and cleanup
      subscriptionCleanup.register('sub-1', 'entry');
      subscriptionCleanup.cleanupAll();
      subscriptionCleanup.register('sub-2', 'entry');
      subscriptionCleanup.cleanupAll();

      // Add old cleanup manually
      subscriptionCleanup['cleanupHistory'].push({
        timestamp: new Date(now - 2 * 60 * 60 * 1000), // 2 hours ago
        count: 1
      });

      // Act
      const report = subscriptionCleanup.generateHealthReport();

      // Assert
      expect(report.recentCleanups).toBe(2); // Only the recent 2
    });

    it('should calculate average cleanup size', () => {
      // Arrange
      subscriptionCleanup['cleanupHistory'] = [
        { timestamp: new Date(), count: 5 },
        { timestamp: new Date(), count: 3 },
        { timestamp: new Date(), count: 7 }
      ];

      // Act
      const report = subscriptionCleanup.generateHealthReport();

      // Assert
      expect(report.averageCleanupSize).toBe(5); // (5 + 3 + 7) / 3 = 5
    });
  });

  describe('startAutoCleanup', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should start periodic cleanup', async () => {
      // Arrange
      const { logger } = await import('@/utils/logger');
      const intervalMinutes = 1;

      // Create old subscriptions
      for (let i = 0; i < 3; i++) {
        subscriptionCleanup.register(`sub-${i}`, 'entry');
      }
      const oldDate = new Date(Date.now() - 31 * 60 * 1000);
      subscriptionCleanup['subscriptions'].forEach(sub => {
        sub.createdAt = oldDate;
      });

      // Act
      const stopCleanup = subscriptionCleanup.startAutoCleanup(intervalMinutes);

      // Fast-forward time
      vi.advanceTimersByTime(intervalMinutes * 60 * 1000);

      // Assert
      expect(subscriptionCleanup.getActiveCount()).toBe(0);
      expect(logger.warn).toHaveBeenCalled();

      // Cleanup
      stopCleanup();
    });

    it('should return cleanup function that stops timer', () => {
      // Arrange
      subscriptionCleanup.register('sub-1', 'entry');

      // Act
      const stopCleanup = subscriptionCleanup.startAutoCleanup(1);
      stopCleanup(); // Stop immediately

      // Fast-forward time
      vi.advanceTimersByTime(60 * 1000);

      // Assert
      // Subscription should still exist because timer was stopped
      expect(subscriptionCleanup.getActiveCount()).toBe(1);
    });

    it('should check for leaks during auto-cleanup', async () => {
      // Arrange
      const { logger } = await import('@/utils/logger');

      // Create leak condition (>10 subscriptions)
      for (let i = 0; i < 15; i++) {
        subscriptionCleanup.register(`sub-${i}`, 'entry');
      }

      // Act
      const stopCleanup = subscriptionCleanup.startAutoCleanup(1);
      vi.advanceTimersByTime(60 * 1000);

      // Assert
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Memory leak warning')
      );

      // Cleanup
      stopCleanup();
    });

    it('should run cleanup at specified intervals', () => {
      // Arrange
      const intervalMinutes = 30;

      for (let i = 0; i < 5; i++) {
        subscriptionCleanup.register(`sub-${i}`, 'entry');
      }
      const oldDate = new Date(Date.now() - 31 * 60 * 1000);
      subscriptionCleanup['subscriptions'].forEach(sub => {
        sub.createdAt = oldDate;
      });

      // Act
      const stopCleanup = subscriptionCleanup.startAutoCleanup(intervalMinutes);

      // Advance by interval
      vi.advanceTimersByTime(intervalMinutes * 60 * 1000);
      expect(subscriptionCleanup.getActiveCount()).toBe(0);

      // Add more subscriptions
      for (let i = 0; i < 3; i++) {
        subscriptionCleanup.register(`new-sub-${i}`, 'entry');
      }
      subscriptionCleanup['subscriptions'].forEach(sub => {
        sub.createdAt = oldDate;
      });

      // Advance by interval again
      vi.advanceTimersByTime(intervalMinutes * 60 * 1000);
      expect(subscriptionCleanup.getActiveCount()).toBe(0);

      // Cleanup
      stopCleanup();
    });
  });

  describe('Edge Cases and Integration', () => {
    it('should handle rapid register/unregister cycles', () => {
      // Act
      for (let i = 0; i < 100; i++) {
        subscriptionCleanup.register(`sub-${i}`, 'entry');
        if (i % 2 === 0) {
          subscriptionCleanup.unregister(`sub-${i}`);
        }
      }

      // Assert
      expect(subscriptionCleanup.getActiveCount()).toBe(50);
    });

    it('should handle mixed operations', () => {
      // Arrange & Act
      subscriptionCleanup.register('sub-1', 'entry', 'LICENSE-A');
      subscriptionCleanup.register('sub-2', 'entry', 'LICENSE-A');
      subscriptionCleanup.register('sub-3', 'announcement');

      const report1 = subscriptionCleanup.generateHealthReport();
      const leakCheck1 = subscriptionCleanup.checkForLeaks();

      subscriptionCleanup.cleanupByLicenseKey('LICENSE-A');

      const report2 = subscriptionCleanup.generateHealthReport();
      const leakCheck2 = subscriptionCleanup.checkForLeaks();

      // Assert
      expect(report1.activeCount).toBe(3);
      expect(leakCheck1.hasLeaks).toBe(false);
      expect(report2.activeCount).toBe(1);
      expect(leakCheck2.hasLeaks).toBe(false);
    });

    it('should maintain history consistency', async () => {
      // Act
      subscriptionCleanup.register('sub-1', 'entry');
      subscriptionCleanup.cleanupAll();

      // Wait a tiny bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 5));

      subscriptionCleanup.register('sub-2', 'entry');
      subscriptionCleanup.register('sub-3', 'entry');
      subscriptionCleanup.cleanupAll();

      // Assert
      const history = subscriptionCleanup.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].count).toBe(1);
      expect(history[1].count).toBe(2);
      expect(history[0].timestamp.getTime()).toBeLessThanOrEqual(
        history[1].timestamp.getTime()
      );
    });

    it('should handle subscriptions with same key but different types', async () => {
      // Arrange
      const { logger } = await import('@/utils/logger');
      const key = 'shared-key';

      // Act
      subscriptionCleanup.register(key, 'entry');
      subscriptionCleanup.register(key, 'announcement'); // Different type, same key

      // Assert
      expect(logger.warn).toHaveBeenCalled(); // Duplicate warning
      expect(subscriptionCleanup.getActiveCount()).toBe(1); // Only one active
    });
  });
});
