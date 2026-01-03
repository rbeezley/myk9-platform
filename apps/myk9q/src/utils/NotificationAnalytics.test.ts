/**
 * Tests for NotificationAnalytics Class
 */

import {
  NotificationAnalytics,
  type NotificationDeliveryRecord,
} from './NotificationAnalytics';

describe('NotificationAnalytics', () => {
  let analytics: NotificationAnalytics;

  beforeEach(() => {
    analytics = new NotificationAnalytics();
  });

  describe('constructor', () => {
    it('should create instance with default max records', () => {
      const instance = new NotificationAnalytics();
      expect(instance.getRecordCount()).toBe(0);
    });

    it('should create instance with custom max records', () => {
      const instance = new NotificationAnalytics({ maxRecords: 50 });
      expect(instance.getRecordCount()).toBe(0);
    });
  });

  describe('recordDelivery', () => {
    it('should record a successful delivery', () => {
      const record: NotificationDeliveryRecord = {
        id: 'notif_1',
        type: 'your_turn',
        sentAt: Date.now(),
        delivered: true,
        clicked: false,
        dismissed: false,
      };

      analytics.recordDelivery(record);

      expect(analytics.getRecordCount()).toBe(1);
      expect(analytics.getRecord('notif_1')).toEqual(record);
    });

    it('should record a failed delivery', () => {
      const record: NotificationDeliveryRecord = {
        id: 'notif_2',
        type: 'results_posted',
        sentAt: Date.now(),
        delivered: false,
        clicked: false,
        dismissed: false,
        error: 'Permission denied',
      };

      analytics.recordDelivery(record);

      expect(analytics.getRecordCount()).toBe(1);
      const stored = analytics.getRecord('notif_2');
      expect(stored?.delivered).toBe(false);
      expect(stored?.error).toBe('Permission denied');
    });

    it('should record with license key', () => {
      const record: NotificationDeliveryRecord = {
        id: 'notif_3',
        type: 'announcement',
        sentAt: Date.now(),
        delivered: true,
        clicked: false,
        dismissed: false,
        licenseKey: 'license_abc',
      };

      analytics.recordDelivery(record);

      const stored = analytics.getRecord('notif_3');
      expect(stored?.licenseKey).toBe('license_abc');
    });

    it('should prune old records when exceeding max', () => {
      const smallAnalytics = new NotificationAnalytics({ maxRecords: 3 });

      for (let i = 0; i < 5; i++) {
        smallAnalytics.recordDelivery({
          id: `notif_${i}`,
          type: 'test',
          sentAt: Date.now(),
          delivered: true,
          clicked: false,
          dismissed: false,
        });
      }

      expect(smallAnalytics.getRecordCount()).toBe(3);
      // First two records should be pruned
      expect(smallAnalytics.getRecord('notif_0')).toBeUndefined();
      expect(smallAnalytics.getRecord('notif_1')).toBeUndefined();
      // Last three should remain
      expect(smallAnalytics.getRecord('notif_2')).toBeDefined();
      expect(smallAnalytics.getRecord('notif_3')).toBeDefined();
      expect(smallAnalytics.getRecord('notif_4')).toBeDefined();
    });

    it('should keep exactly maxRecords when pruning', () => {
      const smallAnalytics = new NotificationAnalytics({ maxRecords: 10 });

      for (let i = 0; i < 25; i++) {
        smallAnalytics.recordDelivery({
          id: `notif_${i}`,
          type: 'test',
          sentAt: Date.now(),
          delivered: true,
          clicked: false,
          dismissed: false,
        });
      }

      expect(smallAnalytics.getRecordCount()).toBe(10);
    });
  });

  describe('markAsClicked', () => {
    beforeEach(() => {
      analytics.recordDelivery({
        id: 'notif_1',
        type: 'your_turn',
        sentAt: Date.now(),
        delivered: true,
        clicked: false,
        dismissed: false,
      });
    });

    it('should mark existing notification as clicked', () => {
      const result = analytics.markAsClicked('notif_1');

      expect(result).toBe(true);
      const record = analytics.getRecord('notif_1');
      expect(record?.clicked).toBe(true);
    });

    it('should return false for non-existent notification', () => {
      const result = analytics.markAsClicked('notif_999');

      expect(result).toBe(false);
    });

    it('should update existing clicked record', () => {
      analytics.markAsClicked('notif_1');
      const result = analytics.markAsClicked('notif_1');

      expect(result).toBe(true);
      expect(analytics.getRecord('notif_1')?.clicked).toBe(true);
    });
  });

  describe('markAsDismissed', () => {
    beforeEach(() => {
      analytics.recordDelivery({
        id: 'notif_1',
        type: 'your_turn',
        sentAt: Date.now(),
        delivered: true,
        clicked: false,
        dismissed: false,
      });
    });

    it('should mark existing notification as dismissed', () => {
      const result = analytics.markAsDismissed('notif_1');

      expect(result).toBe(true);
      const record = analytics.getRecord('notif_1');
      expect(record?.dismissed).toBe(true);
    });

    it('should return false for non-existent notification', () => {
      const result = analytics.markAsDismissed('notif_999');

      expect(result).toBe(false);
    });

    it('should allow both clicked and dismissed', () => {
      analytics.markAsClicked('notif_1');
      analytics.markAsDismissed('notif_1');

      const record = analytics.getRecord('notif_1');
      expect(record?.clicked).toBe(true);
      expect(record?.dismissed).toBe(true);
    });
  });

  describe('getAnalytics', () => {
    it('should return zero metrics for no records', () => {
      const stats = analytics.getAnalytics();

      expect(stats).toEqual({
        total: 0,
        delivered: 0,
        failed: 0,
        clicked: 0,
        dismissed: 0,
        deliveryRate: 0,
        clickRate: 0,
      });
    });

    it('should calculate metrics for single delivery', () => {
      analytics.recordDelivery({
        id: 'notif_1',
        type: 'your_turn',
        sentAt: Date.now(),
        delivered: true,
        clicked: true,
        dismissed: false,
      });

      const stats = analytics.getAnalytics();

      expect(stats.total).toBe(1);
      expect(stats.delivered).toBe(1);
      expect(stats.failed).toBe(0);
      expect(stats.clicked).toBe(1);
      expect(stats.dismissed).toBe(0);
      expect(stats.deliveryRate).toBe(100);
      expect(stats.clickRate).toBe(100);
    });

    it('should calculate metrics for mixed results', () => {
      // 3 delivered (2 clicked, 1 dismissed)
      analytics.recordDelivery({
        id: 'notif_1',
        type: 'your_turn',
        sentAt: Date.now(),
        delivered: true,
        clicked: true,
        dismissed: false,
      });
      analytics.recordDelivery({
        id: 'notif_2',
        type: 'results',
        sentAt: Date.now(),
        delivered: true,
        clicked: true,
        dismissed: false,
      });
      analytics.recordDelivery({
        id: 'notif_3',
        type: 'announcement',
        sentAt: Date.now(),
        delivered: true,
        clicked: false,
        dismissed: true,
      });
      // 2 failed
      analytics.recordDelivery({
        id: 'notif_4',
        type: 'system',
        sentAt: Date.now(),
        delivered: false,
        clicked: false,
        dismissed: false,
      });
      analytics.recordDelivery({
        id: 'notif_5',
        type: 'error',
        sentAt: Date.now(),
        delivered: false,
        clicked: false,
        dismissed: false,
      });

      const stats = analytics.getAnalytics();

      expect(stats.total).toBe(5);
      expect(stats.delivered).toBe(3);
      expect(stats.failed).toBe(2);
      expect(stats.clicked).toBe(2);
      expect(stats.dismissed).toBe(1);
      expect(stats.deliveryRate).toBe(60); // 3/5 * 100
      expect(stats.clickRate).toBeCloseTo(66.67, 1); // 2/3 * 100
    });

    it('should handle all failures correctly', () => {
      analytics.recordDelivery({
        id: 'notif_1',
        type: 'test',
        sentAt: Date.now(),
        delivered: false,
        clicked: false,
        dismissed: false,
      });
      analytics.recordDelivery({
        id: 'notif_2',
        type: 'test',
        sentAt: Date.now(),
        delivered: false,
        clicked: false,
        dismissed: false,
      });

      const stats = analytics.getAnalytics();

      expect(stats.total).toBe(2);
      expect(stats.delivered).toBe(0);
      expect(stats.failed).toBe(2);
      expect(stats.deliveryRate).toBe(0);
      expect(stats.clickRate).toBe(0);
    });

    it('should handle delivered but no clicks', () => {
      analytics.recordDelivery({
        id: 'notif_1',
        type: 'test',
        sentAt: Date.now(),
        delivered: true,
        clicked: false,
        dismissed: false,
      });
      analytics.recordDelivery({
        id: 'notif_2',
        type: 'test',
        sentAt: Date.now(),
        delivered: true,
        clicked: false,
        dismissed: true,
      });

      const stats = analytics.getAnalytics();

      expect(stats.delivered).toBe(2);
      expect(stats.clicked).toBe(0);
      expect(stats.deliveryRate).toBe(100);
      expect(stats.clickRate).toBe(0);
    });
  });

  describe('getAllRecords', () => {
    it('should return empty array when no records', () => {
      const records = analytics.getAllRecords();

      expect(records).toEqual([]);
    });

    it('should return all records', () => {
      const record1: NotificationDeliveryRecord = {
        id: 'notif_1',
        type: 'your_turn',
        sentAt: Date.now(),
        delivered: true,
        clicked: false,
        dismissed: false,
      };
      const record2: NotificationDeliveryRecord = {
        id: 'notif_2',
        type: 'results',
        sentAt: Date.now(),
        delivered: true,
        clicked: true,
        dismissed: false,
      };

      analytics.recordDelivery(record1);
      analytics.recordDelivery(record2);

      const records = analytics.getAllRecords();

      expect(records).toHaveLength(2);
      expect(records).toContainEqual(record1);
      expect(records).toContainEqual(record2);
    });

    it('should return a copy of records', () => {
      analytics.recordDelivery({
        id: 'notif_1',
        type: 'test',
        sentAt: Date.now(),
        delivered: true,
        clicked: false,
        dismissed: false,
      });

      const records = analytics.getAllRecords();
      records.push({
        id: 'notif_2',
        type: 'test',
        sentAt: Date.now(),
        delivered: true,
        clicked: false,
        dismissed: false,
      });

      expect(analytics.getRecordCount()).toBe(1);
    });
  });

  describe('getRecordsByType', () => {
    beforeEach(() => {
      analytics.recordDelivery({
        id: 'notif_1',
        type: 'your_turn',
        sentAt: Date.now(),
        delivered: true,
        clicked: false,
        dismissed: false,
      });
      analytics.recordDelivery({
        id: 'notif_2',
        type: 'results',
        sentAt: Date.now(),
        delivered: true,
        clicked: false,
        dismissed: false,
      });
      analytics.recordDelivery({
        id: 'notif_3',
        type: 'your_turn',
        sentAt: Date.now(),
        delivered: true,
        clicked: true,
        dismissed: false,
      });
    });

    it('should return records matching type', () => {
      const yourTurnRecords = analytics.getRecordsByType('your_turn');

      expect(yourTurnRecords).toHaveLength(2);
      expect(yourTurnRecords.every((r) => r.type === 'your_turn')).toBe(true);
    });

    it('should return empty array for non-existent type', () => {
      const records = analytics.getRecordsByType('unknown');

      expect(records).toEqual([]);
    });

    it('should return single matching record', () => {
      const records = analytics.getRecordsByType('results');

      expect(records).toHaveLength(1);
      expect(records[0].id).toBe('notif_2');
    });
  });

  describe('getRecordsByLicense', () => {
    beforeEach(() => {
      analytics.recordDelivery({
        id: 'notif_1',
        type: 'your_turn',
        sentAt: Date.now(),
        delivered: true,
        clicked: false,
        dismissed: false,
        licenseKey: 'license_abc',
      });
      analytics.recordDelivery({
        id: 'notif_2',
        type: 'results',
        sentAt: Date.now(),
        delivered: true,
        clicked: false,
        dismissed: false,
        licenseKey: 'license_xyz',
      });
      analytics.recordDelivery({
        id: 'notif_3',
        type: 'announcement',
        sentAt: Date.now(),
        delivered: true,
        clicked: false,
        dismissed: false,
        licenseKey: 'license_abc',
      });
    });

    it('should return records matching license key', () => {
      const records = analytics.getRecordsByLicense('license_abc');

      expect(records).toHaveLength(2);
      expect(records.every((r) => r.licenseKey === 'license_abc')).toBe(true);
    });

    it('should return empty array for non-existent license', () => {
      const records = analytics.getRecordsByLicense('license_999');

      expect(records).toEqual([]);
    });

    it('should return single matching record', () => {
      const records = analytics.getRecordsByLicense('license_xyz');

      expect(records).toHaveLength(1);
      expect(records[0].id).toBe('notif_2');
    });
  });

  describe('getRecord', () => {
    it('should return record by ID', () => {
      const record: NotificationDeliveryRecord = {
        id: 'notif_1',
        type: 'your_turn',
        sentAt: Date.now(),
        delivered: true,
        clicked: false,
        dismissed: false,
      };

      analytics.recordDelivery(record);

      expect(analytics.getRecord('notif_1')).toEqual(record);
    });

    it('should return undefined for non-existent ID', () => {
      expect(analytics.getRecord('notif_999')).toBeUndefined();
    });
  });

  describe('clearRecords', () => {
    it('should clear all records', () => {
      analytics.recordDelivery({
        id: 'notif_1',
        type: 'test',
        sentAt: Date.now(),
        delivered: true,
        clicked: false,
        dismissed: false,
      });
      analytics.recordDelivery({
        id: 'notif_2',
        type: 'test',
        sentAt: Date.now(),
        delivered: true,
        clicked: false,
        dismissed: false,
      });

      expect(analytics.getRecordCount()).toBe(2);

      analytics.clearRecords();

      expect(analytics.getRecordCount()).toBe(0);
      expect(analytics.getAllRecords()).toEqual([]);
    });

    it('should reset analytics to zero', () => {
      analytics.recordDelivery({
        id: 'notif_1',
        type: 'test',
        sentAt: Date.now(),
        delivered: true,
        clicked: true,
        dismissed: false,
      });

      analytics.clearRecords();

      const stats = analytics.getAnalytics();
      expect(stats.total).toBe(0);
      expect(stats.delivered).toBe(0);
    });
  });

  describe('getRecordCount', () => {
    it('should return zero for no records', () => {
      expect(analytics.getRecordCount()).toBe(0);
    });

    it('should return correct count', () => {
      analytics.recordDelivery({
        id: 'notif_1',
        type: 'test',
        sentAt: Date.now(),
        delivered: true,
        clicked: false,
        dismissed: false,
      });
      analytics.recordDelivery({
        id: 'notif_2',
        type: 'test',
        sentAt: Date.now(),
        delivered: true,
        clicked: false,
        dismissed: false,
      });

      expect(analytics.getRecordCount()).toBe(2);
    });

    it('should update after clearing', () => {
      analytics.recordDelivery({
        id: 'notif_1',
        type: 'test',
        sentAt: Date.now(),
        delivered: true,
        clicked: false,
        dismissed: false,
      });

      expect(analytics.getRecordCount()).toBe(1);

      analytics.clearRecords();

      expect(analytics.getRecordCount()).toBe(0);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should track complete notification lifecycle', () => {
      const record: NotificationDeliveryRecord = {
        id: 'notif_lifecycle',
        type: 'your_turn',
        sentAt: Date.now(),
        delivered: true,
        clicked: false,
        dismissed: false,
      };

      // Initial delivery
      analytics.recordDelivery(record);
      expect(analytics.getRecord('notif_lifecycle')?.delivered).toBe(true);

      // User clicks
      analytics.markAsClicked('notif_lifecycle');
      expect(analytics.getRecord('notif_lifecycle')?.clicked).toBe(true);

      // Analytics reflect interaction
      const stats = analytics.getAnalytics();
      expect(stats.clickRate).toBe(100);
    });

    it('should handle high-volume tracking with pruning', () => {
      const highVolumeAnalytics = new NotificationAnalytics({ maxRecords: 100 });

      // Record 250 deliveries
      for (let i = 0; i < 250; i++) {
        highVolumeAnalytics.recordDelivery({
          id: `notif_${i}`,
          type: i % 2 === 0 ? 'your_turn' : 'results',
          sentAt: Date.now(),
          delivered: i % 5 !== 0, // 80% delivery rate
          clicked: i % 3 === 0, // 33% click rate
          dismissed: i % 4 === 0, // 25% dismiss rate
        });
      }

      // Should keep only last 100
      expect(highVolumeAnalytics.getRecordCount()).toBe(100);

      // Analytics should reflect last 100 records
      const stats = highVolumeAnalytics.getAnalytics();
      expect(stats.total).toBe(100);
      expect(stats.deliveryRate).toBeGreaterThan(0);
    });

    it('should track multi-user analytics via license keys', () => {
      const users = ['license_user1', 'license_user2', 'license_user3'];

      users.forEach((license, index) => {
        for (let i = 0; i < 5; i++) {
          analytics.recordDelivery({
            id: `${license}_notif_${i}`,
            type: 'your_turn',
            sentAt: Date.now(),
            delivered: true,
            clicked: i < 2, // First 2 clicked
            dismissed: false,
            licenseKey: license,
          });
        }
      });

      // Check per-user metrics
      users.forEach((license) => {
        const userRecords = analytics.getRecordsByLicense(license);
        expect(userRecords).toHaveLength(5);
        const clicked = userRecords.filter((r) => r.clicked).length;
        expect(clicked).toBe(2);
      });

      // Overall metrics
      expect(analytics.getRecordCount()).toBe(15);
    });
  });
});
