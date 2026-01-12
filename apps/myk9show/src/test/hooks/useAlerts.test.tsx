// useAlerts Hook Tests

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAlerts, useAlertNotifications } from '../../hooks/useAlerts';
import AlertingService from '../../services/alerts/AlertingService';
import { logger } from '@/services/LoggingService';
import {
  AlertType,
  AlertSeverity,
  AlertStatus,
  NotificationChannel
} from '../../types/alert-types';

// Mock AlertingService
vi.mock('../../services/alerts/AlertingService', () => {
  const mockService = {
    getInstance: vi.fn(),
    initialize: vi.fn(),
    getAlerts: vi.fn(),
    getAlertStatistics: vi.fn(),
    acknowledgeAlert: vi.fn(),
    resolveAlert: vi.fn(),
    snoozeAlert: vi.fn(),
    createRule: vi.fn(),
    updateRule: vi.fn(),
    deleteRule: vi.fn(),
    setPreferences: vi.fn(),
    getPreferences: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  };

  return {
    default: {
      getInstance: () => mockService
    }
  };
});

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

describe('useAlerts', () => {
  let mockAlertingService: {
    initialize: ReturnType<typeof vi.fn>;
    getAlerts: ReturnType<typeof vi.fn>;
    getAlertStatistics: ReturnType<typeof vi.fn>;
    acknowledgeAlert: ReturnType<typeof vi.fn>;
    resolveAlert: ReturnType<typeof vi.fn>;
    snoozeAlert: ReturnType<typeof vi.fn>;
    createRule: ReturnType<typeof vi.fn>;
    updateRule: ReturnType<typeof vi.fn>;
    deleteRule: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    triggerEvent?: (event: string, data: unknown) => void;
  };

  beforeEach(() => {
    mockAlertingService = AlertingService.getInstance();
    
    // Reset all mocks
    vi.clearAllMocks();
    
    // Setup default mock implementations
    mockAlertingService.initialize.mockResolvedValue(undefined);
    mockAlertingService.getAlerts.mockReturnValue([]);
    mockAlertingService.getAlertStatistics.mockReturnValue({
      total: 0,
      bySeverity: {},
      byStatus: {},
      byType: {},
      recentAlerts: [],
      topRules: []
    });
    mockAlertingService.acknowledgeAlert.mockResolvedValue(undefined);
    mockAlertingService.resolveAlert.mockResolvedValue(undefined);
    mockAlertingService.snoozeAlert.mockResolvedValue(undefined);
    mockAlertingService.createRule.mockImplementation((rule) => Promise.resolve({
      id: 'test-rule-id',
      ...rule
    }));
    mockAlertingService.updateRule.mockImplementation((id, updates) => Promise.resolve({
      id,
      ...updates
    }));
    mockAlertingService.deleteRule.mockResolvedValue(undefined);
    
    // Mock event emitter methods
    const eventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    mockAlertingService.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      if (!eventHandlers[event]) {
        eventHandlers[event] = [];
      }
      eventHandlers[event].push(handler);
    });
    
    mockAlertingService.off.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      if (eventHandlers[event]) {
        const index = eventHandlers[event].indexOf(handler);
        if (index > -1) {
          eventHandlers[event].splice(index, 1);
        }
      }
    });
    
    // Helper to trigger events
    mockAlertingService.triggerEvent = (event: string, data: unknown) => {
      if (eventHandlers[event]) {
        eventHandlers[event].forEach(handler => handler(data));
      }
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with loading state', async () => {
      const { result } = renderHook(() => useAlerts());

      expect(result.current.loading).toBe(true);
      expect(result.current.alerts).toEqual([]);
      expect(result.current.error).toBe(null);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockAlertingService.initialize).toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      const error = new Error('Initialization failed');
      mockAlertingService.initialize.mockRejectedValue(error);

      const { result } = renderHook(() => useAlerts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Initialization failed');
      expect(result.current.isConnected).toBe(false);
    });

    it('should load initial data on successful initialization', async () => {
      const mockAlerts = [
        {
          id: 'alert-1',
          type: AlertType.SYNC_FAILURE,
          severity: AlertSeverity.HIGH,
          status: AlertStatus.ACTIVE,
          title: 'Test Alert',
          message: 'Test message',
          createdAt: new Date(),
          ruleId: 'rule-1',
          count: 1,
          lastOccurrence: new Date(),
          firstOccurrence: new Date()
        }
      ];

      const mockStats = {
        total: 1,
        bySeverity: { [AlertSeverity.HIGH]: 1 },
        byStatus: { [AlertStatus.ACTIVE]: 1 },
        byType: { [AlertType.SYNC_FAILURE]: 1 },
        recentAlerts: mockAlerts,
        topRules: []
      };

      mockAlertingService.getAlerts.mockReturnValue(mockAlerts);
      mockAlertingService.getAlertStatistics.mockReturnValue(mockStats);

      const { result } = renderHook(() => useAlerts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.alerts).toEqual(mockAlerts);
      expect(result.current.statistics).toEqual(mockStats);
      expect(result.current.isConnected).toBe(true);
    });
  });

  describe('Alert Actions', () => {
    it('should acknowledge an alert', async () => {
      const { result } = renderHook(() => useAlerts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.acknowledgeAlert('alert-1');
      });

      expect(mockAlertingService.acknowledgeAlert).toHaveBeenCalledWith('alert-1');
    });

    it('should resolve an alert', async () => {
      const { result } = renderHook(() => useAlerts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.resolveAlert('alert-1');
      });

      expect(mockAlertingService.resolveAlert).toHaveBeenCalledWith('alert-1');
    });

    it('should snooze an alert', async () => {
      const { result } = renderHook(() => useAlerts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const duration = 30 * 60 * 1000; // 30 minutes

      await act(async () => {
        await result.current.snoozeAlert('alert-1', duration);
      });

      expect(mockAlertingService.snoozeAlert).toHaveBeenCalledWith('alert-1', duration);
    });

    it('should handle alert action errors', async () => {
      const error = new Error('Acknowledge failed');
      mockAlertingService.acknowledgeAlert.mockRejectedValue(error);

      const { result } = renderHook(() => useAlerts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await expect(result.current.acknowledgeAlert('alert-1')).rejects.toThrow('Acknowledge failed');
      });

      expect(result.current.error).toBe('Failed to acknowledge alert');
    });
  });

  describe('Rule Actions', () => {
    it('should create a rule', async () => {
      const ruleData = {
        name: 'Test Rule',
        description: 'Test description',
        type: AlertType.SYNC_FAILURE,
        severity: AlertSeverity.MEDIUM,
        enabled: true,
        thresholds: [],
        channels: [NotificationChannel.IN_APP]
      };

      const { result } = renderHook(() => useAlerts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let createdRule;
      await act(async () => {
        createdRule = await result.current.createRule(ruleData);
      });

      expect(mockAlertingService.createRule).toHaveBeenCalledWith(ruleData);
      expect(createdRule).toEqual({
        id: 'test-rule-id',
        ...ruleData
      });
    });

    it('should update a rule', async () => {
      const updates = { name: 'Updated Name', enabled: false };

      const { result } = renderHook(() => useAlerts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.updateRule('rule-1', updates);
      });

      expect(mockAlertingService.updateRule).toHaveBeenCalledWith('rule-1', updates);
    });

    it('should delete a rule', async () => {
      const { result } = renderHook(() => useAlerts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.deleteRule('rule-1');
      });

      expect(mockAlertingService.deleteRule).toHaveBeenCalledWith('rule-1');
    });

    it('should toggle a rule', async () => {
      const mockRules = [
        {
          id: 'rule-1',
          name: 'Test Rule',
          enabled: true,
          type: AlertType.SYNC_FAILURE,
          severity: AlertSeverity.MEDIUM,
          description: 'Test',
          thresholds: [],
          channels: [NotificationChannel.IN_APP]
        }
      ];

      const { result } = renderHook(() => useAlerts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Set the rules
      act(() => {
        (result.current as Record<string, unknown>).rules = mockRules;
      });

      await act(async () => {
        await result.current.toggleRule('rule-1');
      });

      expect(mockAlertingService.updateRule).toHaveBeenCalledWith('rule-1', { enabled: false });
    });
  });

  describe('Real-time Updates', () => {
    it('should handle real-time alert updates', async () => {
      const { result } = renderHook(() => useAlerts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const newAlert = {
        id: 'new-alert',
        type: AlertType.SYNC_FAILURE,
        severity: AlertSeverity.HIGH,
        status: AlertStatus.ACTIVE,
        title: 'New Alert',
        message: 'New alert message',
        createdAt: new Date(),
        ruleId: 'rule-1',
        count: 1,
        lastOccurrence: new Date(),
        firstOccurrence: new Date()
      };

      act(() => {
        mockAlertingService.triggerEvent?.('alert_created', newAlert);
      });

      expect(result.current.alerts).toContainEqual(newAlert);
      expect(result.current.lastUpdate).toBeDefined();
    });

    it('should update statistics on alert changes', async () => {
      const { result } = renderHook(() => useAlerts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const newAlert = {
        id: 'new-alert',
        type: AlertType.SYNC_FAILURE,
        severity: AlertSeverity.HIGH,
        status: AlertStatus.ACTIVE,
        title: 'New Alert',
        message: 'New alert message',
        createdAt: new Date(),
        ruleId: 'rule-1',
        count: 1,
        lastOccurrence: new Date(),
        firstOccurrence: new Date()
      };

      act(() => {
        mockAlertingService.triggerEvent?.('alert_created', newAlert);
      });

      expect(mockAlertingService.getAlertStatistics).toHaveBeenCalled();
    });
  });

  describe('Query Management', () => {
    it('should update query and refetch data', async () => {
      const { result } = renderHook(() => useAlerts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const newQuery = {
        status: [AlertStatus.ACTIVE],
        severity: [AlertSeverity.HIGH]
      };

      await act(async () => {
        result.current.setQuery(newQuery);
        await result.current.refetch();
      });

      expect(mockAlertingService.getAlerts).toHaveBeenCalledWith(newQuery);
    });
  });

  describe('Auto-refresh', () => {
    it('should auto-refresh when enabled', async () => {
      vi.useFakeTimers();

      const { result } = renderHook(() => useAlerts({
        autoRefresh: true,
        refreshInterval: 10000
      }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Clear initial calls
      vi.clearAllMocks();

      // Fast-forward time
      act(() => {
        vi.advanceTimersByTime(10000);
      });

      await waitFor(() => {
        expect(mockAlertingService.getAlerts).toHaveBeenCalled();
      });

      vi.useRealTimers();
    });

    it('should not auto-refresh when disabled', async () => {
      vi.useFakeTimers();

      const { result } = renderHook(() => useAlerts({
        autoRefresh: false
      }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Clear initial calls
      vi.clearAllMocks();

      // Fast-forward time
      act(() => {
        vi.advanceTimersByTime(30000);
      });

      // Should not have been called again
      expect(mockAlertingService.getAlerts).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});

describe('useAlertNotifications', () => {
  let mockAlertingService: {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    triggerEvent?: (event: string, data: unknown) => void;
  };

  beforeEach(() => {
    mockAlertingService = AlertingService.getInstance();
    vi.clearAllMocks();

    // Mock event emitter
    const eventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    mockAlertingService.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      if (!eventHandlers[event]) {
        eventHandlers[event] = [];
      }
      eventHandlers[event].push(handler);
    });
    
    mockAlertingService.off.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      if (eventHandlers[event]) {
        const index = eventHandlers[event].indexOf(handler);
        if (index > -1) {
          eventHandlers[event].splice(index, 1);
        }
      }
    });
    
    mockAlertingService.triggerEvent = (event: string, data: unknown) => {
      if (eventHandlers[event]) {
        eventHandlers[event].forEach(handler => handler(data));
      }
    };
  });

  it('should handle in-app notifications', async () => {
    const { result } = renderHook(() => useAlertNotifications());

    const notification = {
      id: 'notif-1',
      type: AlertType.SYNC_FAILURE,
      severity: AlertSeverity.HIGH,
      title: 'Test Notification',
      message: 'Test message',
      timestamp: new Date()
    };

    act(() => {
      mockAlertingService.triggerEvent?.('in_app_notification', notification);
    });

    expect(result.current.toastAlerts).toHaveLength(1);
    expect(result.current.unreadCount).toBe(1);
    expect(result.current.toastAlerts[0].title).toBe('Test Notification');
  });

  it('should dismiss toast notifications', async () => {
    const { result } = renderHook(() => useAlertNotifications());

    const notification = {
      id: 'notif-1',
      type: AlertType.SYNC_FAILURE,
      severity: AlertSeverity.HIGH,
      title: 'Test Notification',
      message: 'Test message',
      timestamp: new Date()
    };

    act(() => {
      mockAlertingService.triggerEvent?.('in_app_notification', notification);
    });

    expect(result.current.toastAlerts).toHaveLength(1);

    act(() => {
      result.current.dismissToast('notif-1');
    });

    expect(result.current.toastAlerts).toHaveLength(0);
  });

  it('should limit the number of toast notifications', async () => {
    const { result } = renderHook(() => useAlertNotifications({ maxToasts: 2 }));

    // Send 3 notifications
    for (let i = 1; i <= 3; i++) {
      const notification = {
        id: `notif-${i}`,
        type: AlertType.SYNC_FAILURE,
        severity: AlertSeverity.HIGH,
        title: `Test Notification ${i}`,
        message: 'Test message',
        timestamp: new Date()
      };

      act(() => {
        mockAlertingService.triggerEvent?.('in_app_notification', notification);
      });
    }

    // Should only show 2 notifications (maxToasts = 2)
    expect(result.current.toastAlerts).toHaveLength(2);
    // Should show the most recent ones
    expect(result.current.toastAlerts[0].title).toBe('Test Notification 3');
    expect(result.current.toastAlerts[1].title).toBe('Test Notification 2');
  });

  it('should toggle notifications on/off', async () => {
    const { result } = renderHook(() => useAlertNotifications());

    // Disable notifications
    act(() => {
      result.current.toggleNotifications(false);
    });

    expect(result.current.notificationsEnabled).toBe(false);
    expect(result.current.toastAlerts).toHaveLength(0);
    expect(result.current.unreadCount).toBe(0);

    // Try to send notification while disabled
    const notification = {
      id: 'notif-1',
      type: AlertType.SYNC_FAILURE,
      severity: AlertSeverity.HIGH,
      title: 'Test Notification',
      message: 'Test message',
      timestamp: new Date()
    };

    act(() => {
      mockAlertingService.triggerEvent?.('in_app_notification', notification);
    });

    // Should not appear since notifications are disabled
    expect(result.current.toastAlerts).toHaveLength(0);

    // Re-enable notifications
    act(() => {
      result.current.toggleNotifications(true);
    });

    expect(result.current.notificationsEnabled).toBe(true);
  });

  it('should clear all notifications', async () => {
    const { result } = renderHook(() => useAlertNotifications());

    // Send multiple notifications
    for (let i = 1; i <= 3; i++) {
      const notification = {
        id: `notif-${i}`,
        type: AlertType.SYNC_FAILURE,
        severity: AlertSeverity.HIGH,
        title: `Test Notification ${i}`,
        message: 'Test message',
        timestamp: new Date()
      };

      act(() => {
        mockAlertingService.triggerEvent?.('in_app_notification', notification);
      });
    }

    expect(result.current.toastAlerts).toHaveLength(3);
    expect(result.current.unreadCount).toBe(3);

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.toastAlerts).toHaveLength(0);
    expect(result.current.unreadCount).toBe(0);
  });

  it('should mark notifications as read', async () => {
    const { result } = renderHook(() => useAlertNotifications());

    const notification = {
      id: 'notif-1',
      type: AlertType.SYNC_FAILURE,
      severity: AlertSeverity.HIGH,
      title: 'Test Notification',
      message: 'Test message',
      timestamp: new Date()
    };

    act(() => {
      mockAlertingService.triggerEvent?.('in_app_notification', notification);
    });

    expect(result.current.unreadCount).toBe(1);

    act(() => {
      result.current.markAsRead('notif-1');
    });

    expect(result.current.unreadCount).toBe(0);
  });
});