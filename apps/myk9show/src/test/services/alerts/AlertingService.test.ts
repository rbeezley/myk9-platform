// AlertingService Tests

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import AlertingService from '../../../services/alerts/AlertingService';
import {
  AlertType,
  AlertSeverity,
  AlertStatus,
  NotificationChannel,
  AlertRule
} from '../../../types/alert-types';

// Mock SyncAnalyticsService
vi.mock('../../../services/analytics/SyncAnalyticsService', () => ({
  SyncAnalyticsService: {
    getInstance: vi.fn(() => ({
      getCurrentMetrics: vi.fn(() => ({})),
      on: vi.fn(),
      off: vi.fn()
    }))
  }
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    })
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock Notification API
Object.defineProperty(window, 'Notification', {
  value: {
    permission: 'granted',
    requestPermission: vi.fn(() => Promise.resolve('granted'))
  },
  writable: true
});

describe('AlertingService', () => {
  let alertingService: AlertingService;

  beforeEach(async () => {
    // Clear localStorage mock
    localStorageMock.clear();
    
    // Reset singleton
    (AlertingService as unknown as { instance?: AlertingService }).instance = undefined;
    
    // Get fresh instance
    alertingService = AlertingService.getInstance();
    await alertingService.initialize();
  });

  afterEach(() => {
    alertingService.destroy();
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const service = AlertingService.getInstance();
      await service.initialize();
      
      expect(service).toBeDefined();
    });

    it('should be a singleton', () => {
      const instance1 = AlertingService.getInstance();
      const instance2 = AlertingService.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should load default rules on initialization', async () => {
      const service = AlertingService.getInstance();
      await service.initialize();
      
      // Check that some default rules exist
      const stats = service.getAlertStatistics();
      expect(stats).toBeDefined();
    });
  });

  describe('Alert Management', () => {
    let testRule: AlertRule;

    beforeEach(async () => {
      testRule = await alertingService.createRule({
        name: 'Test Rule',
        description: 'Test rule for unit tests',
        type: AlertType.SYNC_FAILURE,
        severity: AlertSeverity.HIGH,
        enabled: true,
        thresholds: [
          {
            metric: 'test.metric',
            operator: 'gt',
            value: 10
          }
        ],
        channels: [NotificationChannel.IN_APP],
        cooldown: 60000
      });
    });

    it('should create an alert', async () => {
      const alert = await alertingService.createAlert(
        testRule.id,
        'Test Alert',
        'This is a test alert message'
      );

      expect(alert).toBeDefined();
      expect(alert.title).toBe('Test Alert');
      expect(alert.message).toBe('This is a test alert message');
      expect(alert.type).toBe(AlertType.SYNC_FAILURE);
      expect(alert.severity).toBe(AlertSeverity.HIGH);
      expect(alert.status).toBe(AlertStatus.ACTIVE);
    });

    it('should acknowledge an alert', async () => {
      const alert = await alertingService.createAlert(
        testRule.id,
        'Test Alert',
        'Test message'
      );

      await alertingService.acknowledgeAlert(alert.id, 'test-user');

      const alerts = alertingService.getAlerts();
      const acknowledgedAlert = alerts.find(a => a.id === alert.id);
      
      expect(acknowledgedAlert?.status).toBe(AlertStatus.ACKNOWLEDGED);
      expect(acknowledgedAlert?.acknowledgedBy).toBe('test-user');
      expect(acknowledgedAlert?.acknowledgedAt).toBeDefined();
    });

    it('should resolve an alert', async () => {
      const alert = await alertingService.createAlert(
        testRule.id,
        'Test Alert',
        'Test message'
      );

      await alertingService.resolveAlert(alert.id, 'test-user');

      const alerts = alertingService.getAlerts();
      const resolvedAlert = alerts.find(a => a.id === alert.id);
      
      expect(resolvedAlert?.status).toBe(AlertStatus.RESOLVED);
      expect(resolvedAlert?.resolvedBy).toBe('test-user');
      expect(resolvedAlert?.resolvedAt).toBeDefined();
    });

    it('should snooze an alert', async () => {
      const alert = await alertingService.createAlert(
        testRule.id,
        'Test Alert',
        'Test message'
      );

      const snoozeDuration = 30 * 60 * 1000; // 30 minutes
      await alertingService.snoozeAlert(alert.id, snoozeDuration);

      const alerts = alertingService.getAlerts();
      const snoozedAlert = alerts.find(a => a.id === alert.id);
      
      expect(snoozedAlert?.status).toBe(AlertStatus.SNOOZED);
      expect(snoozedAlert?.snoozedUntil).toBeDefined();
    });

    it('should handle grouped alerts', async () => {
      // Create rule with groupBy
      const groupedRule = await alertingService.createRule({
        name: 'Grouped Test Rule',
        description: 'Test rule for grouped alerts',
        type: AlertType.SYNC_FAILURE,
        severity: AlertSeverity.MEDIUM,
        enabled: true,
        thresholds: [
          {
            metric: 'test.metric',
            operator: 'gt',
            value: 5
          }
        ],
        channels: [NotificationChannel.IN_APP],
        groupBy: ['entityType']
      });

      // Create first alert
      const alert1 = await alertingService.createAlert(
        groupedRule.id,
        'First Alert',
        'First message',
        { entityType: 'dog' }
      );

      // Create second alert with same groupBy field
      await alertingService.createAlert(
        groupedRule.id,
        'Second Alert',
        'Second message',
        { entityType: 'dog' }
      );

      const alerts = alertingService.getAlerts();
      const groupedAlert = alerts.find(a => a.id === alert1.id);
      
      expect(groupedAlert?.count).toBe(2);
      expect(groupedAlert?.message).toBe('Second message'); // Latest message
    });
  });

  describe('Rule Management', () => {
    it('should create a rule', async () => {
      const ruleData = {
        name: 'Test Rule',
        description: 'Test description',
        type: AlertType.PERFORMANCE_DEGRADATION,
        severity: AlertSeverity.MEDIUM,
        enabled: true,
        thresholds: [
          {
            metric: 'performance.latency',
            operator: 'gt' as const,
            value: 1000
          }
        ],
        channels: [NotificationChannel.IN_APP, NotificationChannel.BROWSER],
        cooldown: 300000
      };

      const rule = await alertingService.createRule(ruleData);

      expect(rule).toBeDefined();
      expect(rule.id).toBeDefined();
      expect(rule.name).toBe(ruleData.name);
      expect(rule.type).toBe(ruleData.type);
    });

    it('should update a rule', async () => {
      const rule = await alertingService.createRule({
        name: 'Original Name',
        description: 'Original description',
        type: AlertType.SYNC_FAILURE,
        severity: AlertSeverity.LOW,
        enabled: true,
        thresholds: [],
        channels: [NotificationChannel.IN_APP]
      });

      const updates = {
        name: 'Updated Name',
        severity: AlertSeverity.HIGH,
        enabled: false
      };

      const updatedRule = await alertingService.updateRule(rule.id, updates);

      expect(updatedRule.name).toBe('Updated Name');
      expect(updatedRule.severity).toBe(AlertSeverity.HIGH);
      expect(updatedRule.enabled).toBe(false);
    });

    it('should delete a rule', async () => {
      const rule = await alertingService.createRule({
        name: 'Rule to Delete',
        description: 'This rule will be deleted',
        type: AlertType.SYNC_FAILURE,
        severity: AlertSeverity.LOW,
        enabled: true,
        thresholds: [],
        channels: [NotificationChannel.IN_APP]
      });

      await alertingService.deleteRule(rule.id);

      // Try to update the deleted rule - should throw error
      await expect(
        alertingService.updateRule(rule.id, { name: 'Updated' })
      ).rejects.toThrow('Rule not found');
    });
  });

  describe('Alert Queries', () => {
    beforeEach(async () => {
      // Create test data
      const rule = await alertingService.createRule({
        name: 'Query Test Rule',
        description: 'Rule for query testing',
        type: AlertType.SYNC_FAILURE,
        severity: AlertSeverity.HIGH,
        enabled: true,
        thresholds: [],
        channels: [NotificationChannel.IN_APP]
      });

      // Create multiple alerts
      await alertingService.createAlert(rule.id, 'Alert 1', 'Message 1');
      await alertingService.createAlert(rule.id, 'Alert 2', 'Message 2');
      await alertingService.createAlert(rule.id, 'Alert 3', 'Message 3');
    });

    it('should query alerts by status', async () => {
      const activeAlerts = alertingService.getAlerts({
        status: [AlertStatus.ACTIVE]
      });

      expect(activeAlerts.length).toBeGreaterThan(0);
      activeAlerts.forEach(alert => {
        expect(alert.status).toBe(AlertStatus.ACTIVE);
      });
    });

    it('should query alerts by severity', async () => {
      const highSeverityAlerts = alertingService.getAlerts({
        severity: [AlertSeverity.HIGH]
      });

      expect(highSeverityAlerts.length).toBeGreaterThan(0);
      highSeverityAlerts.forEach(alert => {
        expect(alert.severity).toBe(AlertSeverity.HIGH);
      });
    });

    it('should limit query results', async () => {
      const limitedAlerts = alertingService.getAlerts({
        limit: 2
      });

      expect(limitedAlerts.length).toBeLessThanOrEqual(2);
    });

    it('should sort alerts', async () => {
      const sortedAlerts = alertingService.getAlerts({
        sortBy: 'createdAt',
        sortOrder: 'desc'
      });

      for (let i = 1; i < sortedAlerts.length; i++) {
        expect(sortedAlerts[i - 1].createdAt.getTime())
          .toBeGreaterThanOrEqual(sortedAlerts[i].createdAt.getTime());
      }
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      // Create test data with different severities and statuses
      const rule = await alertingService.createRule({
        name: 'Stats Test Rule',
        description: 'Rule for statistics testing',
        type: AlertType.SYNC_FAILURE,
        severity: AlertSeverity.HIGH,
        enabled: true,
        thresholds: [],
        channels: [NotificationChannel.IN_APP]
      });

      const criticalRule = await alertingService.createRule({
        name: 'Critical Rule',
        description: 'Critical rule',
        type: AlertType.DATA_INTEGRITY,
        severity: AlertSeverity.CRITICAL,
        enabled: true,
        thresholds: [],
        channels: [NotificationChannel.IN_APP]
      });

      // Create alerts
      const alert1 = await alertingService.createAlert(rule.id, 'Alert 1', 'Message 1');
      await alertingService.createAlert(criticalRule.id, 'Critical Alert', 'Critical');
      
      // Resolve one alert
      await alertingService.resolveAlert(alert1.id);
    });

    it('should generate correct statistics', async () => {
      const stats = alertingService.getAlertStatistics();

      expect(stats).toBeDefined();
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.bySeverity).toBeDefined();
      expect(stats.byStatus).toBeDefined();
      expect(stats.byType).toBeDefined();
      expect(stats.recentAlerts).toBeDefined();
      expect(stats.topRules).toBeDefined();
    });

    it('should track alerts by severity', async () => {
      const stats = alertingService.getAlertStatistics();

      expect(stats.bySeverity[AlertSeverity.HIGH]).toBeGreaterThan(0);
      expect(stats.bySeverity[AlertSeverity.CRITICAL]).toBeGreaterThan(0);
    });

    it('should track alerts by status', async () => {
      const stats = alertingService.getAlertStatistics();

      expect(stats.byStatus[AlertStatus.ACTIVE]).toBeGreaterThan(0);
      expect(stats.byStatus[AlertStatus.RESOLVED]).toBeGreaterThan(0);
    });
  });

  describe('Preferences', () => {
    it('should set and get user preferences', async () => {
      const preferences = {
        userId: 'test-user',
        channels: {
          [NotificationChannel.IN_APP]: {
            enabled: true,
            severities: [AlertSeverity.HIGH, AlertSeverity.CRITICAL]
          },
          [NotificationChannel.EMAIL]: {
            enabled: false,
            severities: [AlertSeverity.CRITICAL]
          }
        },
        quiet: {
          enabled: true,
          start: '22:00',
          end: '08:00'
        },
        email: 'test@example.com'
      };

      await alertingService.setPreferences('test-user', preferences);
      const retrievedPreferences = alertingService.getPreferences('test-user');

      expect(retrievedPreferences).toEqual(preferences);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid alert operations', async () => {
      // Try to acknowledge non-existent alert
      await expect(
        alertingService.acknowledgeAlert('non-existent-id')
      ).rejects.toThrow('Alert not found');

      // Try to resolve non-existent alert
      await expect(
        alertingService.resolveAlert('non-existent-id')
      ).rejects.toThrow('Alert not found');

      // Try to snooze non-existent alert
      await expect(
        alertingService.snoozeAlert('non-existent-id', 60000)
      ).rejects.toThrow('Alert not found');
    });

    it('should handle invalid rule operations', async () => {
      // Try to update non-existent rule
      await expect(
        alertingService.updateRule('non-existent-id', { name: 'Updated' })
      ).rejects.toThrow('Rule not found');

      // Try to delete non-existent rule
      await expect(
        alertingService.deleteRule('non-existent-id')
      ).rejects.toThrow('Rule not found');

      // Try to create alert with non-existent rule
      await expect(
        alertingService.createAlert('non-existent-rule', 'Title', 'Message')
      ).rejects.toThrow('Alert rule not found');
    });
  });

  describe('Persistence', () => {
    it('should persist alerts to localStorage', async () => {
      const rule = await alertingService.createRule({
        name: 'Persistence Test Rule',
        description: 'Test persistence',
        type: AlertType.SYNC_FAILURE,
        severity: AlertSeverity.MEDIUM,
        enabled: true,
        thresholds: [],
        channels: [NotificationChannel.IN_APP]
      });

      await alertingService.createAlert(rule.id, 'Persisted Alert', 'This should be persisted');

      // Check localStorage was called
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'myK9Show_alerts',
        expect.any(String)
      );
    });

    it('should persist rules to localStorage', async () => {
      await alertingService.createRule({
        name: 'Persisted Rule',
        description: 'This should be persisted',
        type: AlertType.SYNC_FAILURE,
        severity: AlertSeverity.LOW,
        enabled: true,
        thresholds: [],
        channels: [NotificationChannel.IN_APP]
      });

      // Check localStorage was called
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'myK9Show_alert_rules',
        expect.any(String)
      );
    });

    it('should persist preferences to localStorage', async () => {
      const preferences = {
        userId: 'test-user',
        channels: {
          [NotificationChannel.IN_APP]: {
            enabled: true,
            severities: [AlertSeverity.HIGH]
          }
        },
        quiet: {
          enabled: false
        }
      };

      await alertingService.setPreferences('test-user', preferences);

      // Check localStorage was called
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'myK9Show_alert_preferences',
        expect.any(String)
      );
    });
  });
});