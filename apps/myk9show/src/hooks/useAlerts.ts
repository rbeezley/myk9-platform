// Custom hook for Alert Management

import { useEffect, useState, useCallback } from 'react';
import AlertingService from '../services/alerts/AlertingService';
import { logger } from '@/services/LoggingService';
import {
  Alert,
  AlertRule,
  AlertType,
  AlertSeverity,
  AlertStatus,
  AlertStatistics,
  AlertQuery,
  AlertPreferences,
  NotificationChannel
} from '../types/alert-types';

// Type-safe event handlers for AlertingService events

interface UseAlertsOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
  initialQuery?: AlertQuery;
}

interface UseAlertsReturn {
  // State
  alerts: Alert[];
  rules: AlertRule[];
  statistics: AlertStatistics | null;
  loading: boolean;
  error: string | null;
  
  // Alert Actions
  acknowledgeAlert: (alertId: string) => Promise<void>;
  resolveAlert: (alertId: string) => Promise<void>;
  snoozeAlert: (alertId: string, duration: number) => Promise<void>;
  
  // Rule Actions
  createRule: (rule: Omit<AlertRule, 'id'>) => Promise<AlertRule>;
  updateRule: (ruleId: string, updates: Partial<AlertRule>) => Promise<AlertRule>;
  deleteRule: (ruleId: string) => Promise<void>;
  toggleRule: (ruleId: string) => Promise<void>;
  
  // Query Actions
  refetch: (query?: AlertQuery) => Promise<void>;
  setQuery: (query: AlertQuery) => void;
  
  // Preferences
  preferences: AlertPreferences | null;
  updatePreferences: (preferences: AlertPreferences) => Promise<void>;
  
  // Real-time Updates
  isConnected: boolean;
  lastUpdate: Date | null;
}

interface UseAlertNotificationsOptions {
  maxToasts?: number;
  autoHideDuration?: number;
  channels?: NotificationChannel[];
}

interface UseAlertNotificationsReturn {
  // Notification State
  toastAlerts: Alert[];
  unreadCount: number;
  
  // Actions
  dismissToast: (alertId: string) => void;
  markAsRead: (alertId: string) => void;
  clearAll: () => void;
  
  // Settings
  notificationsEnabled: boolean;
  toggleNotifications: (enabled: boolean) => void;
  requestPermission: () => Promise<boolean>;
}

export const useAlerts = (options: UseAlertsOptions = {}): UseAlertsReturn => {
  const {
    autoRefresh = true,
    refreshInterval = 30000, // 30 seconds
    initialQuery
  } = options;

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [statistics, setStatistics] = useState<AlertStatistics | null>(null);
  const [preferences, setPreferences] = useState<AlertPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentQuery, setCurrentQuery] = useState<AlertQuery | undefined>(initialQuery);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const alertingService = AlertingService.getInstance();

  // Load data function must be defined before useEffect that uses it
  const loadData = useCallback(async () => {
    try {
      const [alertData, statsData] = await Promise.all([
        alertingService.getAlerts(currentQuery),
        alertingService.getAlertStatistics()
      ]);

      setAlerts(alertData);
      setStatistics(statsData);
      setError(null);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alerts');
    }
  }, [alertingService, currentQuery]);

  // Initialize service and load initial data
  useEffect(() => {
    const initializeService = async () => {
      try {
        setLoading(true);
        await alertingService.initialize();
        setIsConnected(true);
        await loadData();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize alerting service');
        setIsConnected(false);
      } finally {
        setLoading(false);
      }
    };

    initializeService();
  }, [alertingService, loadData]);

  const updateStatistics = useCallback(async () => {
    try {
      const stats = alertingService.getAlertStatistics();
      setStatistics(stats);
    } catch {
      // Statistics update failed - continue with stale data
    }
  }, [alertingService]);

  // Set up real-time listeners
  useEffect(() => {
    const handleAlertCreated = (data: unknown) => {
      const alert = data as Alert;
      setAlerts(prev => [alert, ...prev]);
      updateStatistics();
      setLastUpdate(new Date());
    };

    const handleAlertUpdated = (data: unknown) => {
      const alert = data as Alert;
      setAlerts(prev => prev.map(a => a.id === alert.id ? alert : a));
      updateStatistics();
      setLastUpdate(new Date());
    };

    const handleAlertResolved = (data: unknown) => {
      const alert = data as Alert;
      setAlerts(prev => prev.map(a => a.id === alert.id ? alert : a));
      updateStatistics();
      setLastUpdate(new Date());
    };

    const handleRuleCreated = (data: unknown) => {
      const rule = data as AlertRule;
      setRules(prev => [...prev, rule]);
      setLastUpdate(new Date());
    };

    const handleRuleUpdated = (data: unknown) => {
      const rule = data as AlertRule;
      setRules(prev => prev.map(r => r.id === rule.id ? rule : r));
      setLastUpdate(new Date());
    };

    const handleRuleDeleted = (data: unknown) => {
      const ruleId = data as string;
      setRules(prev => prev.filter(r => r.id !== ruleId));
      setLastUpdate(new Date());
    };

    // Subscribe to events with proper type assertions
    alertingService.on('alert_created', handleAlertCreated as (data: unknown) => void);
    alertingService.on('alert_updated', handleAlertUpdated as (data: unknown) => void);
    alertingService.on('alert_acknowledged', handleAlertUpdated as (data: unknown) => void);
    alertingService.on('alert_resolved', handleAlertResolved as (data: unknown) => void);
    alertingService.on('alert_snoozed', handleAlertUpdated as (data: unknown) => void);
    alertingService.on('rule_created', handleRuleCreated as (data: unknown) => void);
    alertingService.on('rule_updated', handleRuleUpdated as (data: unknown) => void);
    alertingService.on('rule_deleted', handleRuleDeleted as (data: unknown) => void);

    return () => {
      alertingService.off('alert_created', handleAlertCreated as (data: unknown) => void);
      alertingService.off('alert_updated', handleAlertUpdated as (data: unknown) => void);
      alertingService.off('alert_acknowledged', handleAlertUpdated as (data: unknown) => void);
      alertingService.off('alert_resolved', handleAlertResolved as (data: unknown) => void);
      alertingService.off('alert_snoozed', handleAlertUpdated as (data: unknown) => void);
      alertingService.off('rule_created', handleRuleCreated as (data: unknown) => void);
      alertingService.off('rule_updated', handleRuleUpdated as (data: unknown) => void);
      alertingService.off('rule_deleted', handleRuleDeleted as (data: unknown) => void);
    };
  }, [alertingService, updateStatistics]);

  // Auto-refresh data
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadData();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, currentQuery, loadData]);


  // Alert Actions
  const acknowledgeAlert = useCallback(async (alertId: string) => {
    try {
      await alertingService.acknowledgeAlert(alertId);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to acknowledge alert');
      throw err;
    }
  }, [alertingService]);

  const resolveAlert = useCallback(async (alertId: string) => {
    try {
      await alertingService.resolveAlert(alertId);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve alert');
      throw err;
    }
  }, [alertingService]);

  const snoozeAlert = useCallback(async (alertId: string, duration: number) => {
    try {
      await alertingService.snoozeAlert(alertId, duration);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to snooze alert');
      throw err;
    }
  }, [alertingService]);

  // Rule Actions
  const createRule = useCallback(async (rule: Omit<AlertRule, 'id'>) => {
    try {
      const newRule = await alertingService.createRule(rule);
      setError(null);
      return newRule;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create rule');
      throw err;
    }
  }, [alertingService]);

  const updateRule = useCallback(async (ruleId: string, updates: Partial<AlertRule>) => {
    try {
      const updatedRule = await alertingService.updateRule(ruleId, updates);
      setError(null);
      return updatedRule;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update rule');
      throw err;
    }
  }, [alertingService]);

  const deleteRule = useCallback(async (ruleId: string) => {
    try {
      await alertingService.deleteRule(ruleId);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rule');
      throw err;
    }
  }, [alertingService]);

  const toggleRule = useCallback(async (ruleId: string) => {
    try {
      const rule = rules.find(r => r.id === ruleId);
      if (!rule) throw new Error('Rule not found');
      
      await alertingService.updateRule(ruleId, { enabled: !rule.enabled });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle rule');
      throw err;
    }
  }, [alertingService, rules]);

  // Query Actions
  const refetch = useCallback(async (query?: AlertQuery) => {
    if (query) {
      setCurrentQuery(query);
    }
    await loadData();
  }, [loadData]);

  const setQuery = useCallback((query: AlertQuery) => {
    setCurrentQuery(query);
  }, []);

  // Preferences
  const updatePreferences = useCallback(async (newPreferences: AlertPreferences) => {
    try {
      await alertingService.setPreferences(newPreferences.userId, newPreferences);
      setPreferences(newPreferences);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update preferences');
      throw err;
    }
  }, [alertingService]);

  return {
    // State
    alerts,
    rules,
    statistics,
    loading,
    error,
    
    // Alert Actions
    acknowledgeAlert,
    resolveAlert,
    snoozeAlert,
    
    // Rule Actions
    createRule,
    updateRule,
    deleteRule,
    toggleRule,
    
    // Query Actions
    refetch,
    setQuery,
    
    // Preferences
    preferences,
    updatePreferences,
    
    // Real-time Updates
    isConnected,
    lastUpdate
  };
};

export const useAlertNotifications = (
  options: UseAlertNotificationsOptions = {}
): UseAlertNotificationsReturn => {
  const {
    maxToasts = 5,
    autoHideDuration = 8000
  } = options;

  const [toastAlerts, setToastAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const alertingService = AlertingService.getInstance();

  const dismissToast = useCallback((alertId: string) => {
    setToastAlerts(prev => prev.filter(alert => alert.id !== alertId));
  }, []);

  useEffect(() => {
    const handleInAppNotification = (data: unknown) => {
      const notification = data as {
        id: string;
        type: string;
        severity: AlertSeverity;
        title: string;
        message: string;
        timestamp: Date;
      };
      if (!notificationsEnabled) return;
      
      const alert: Alert = {
        id: notification.id,
        ruleId: '',
        type: notification.type as AlertType,
        severity: notification.severity,
        status: AlertStatus.ACTIVE,
        title: notification.title,
        message: notification.message,
        createdAt: notification.timestamp,
        count: 1,
        lastOccurrence: notification.timestamp,
        firstOccurrence: notification.timestamp
      };

      setToastAlerts(prev => {
        const newAlerts = [alert, ...prev.slice(0, maxToasts - 1)];
        return newAlerts;
      });

      setUnreadCount(prev => prev + 1);

      // Auto-hide non-critical alerts
      if (
        autoHideDuration > 0 && 
        alert.severity !== AlertSeverity.CRITICAL &&
        alert.severity !== AlertSeverity.HIGH
      ) {
        setTimeout(() => {
          dismissToast(alert.id);
        }, autoHideDuration);
      }
    };

    alertingService.on('in_app_notification', handleInAppNotification as (data: unknown) => void);

    return () => {
      alertingService.off('in_app_notification', handleInAppNotification as (data: unknown) => void);
    };
  }, [notificationsEnabled, maxToasts, autoHideDuration, alertingService, dismissToast]);

  const markAsRead = useCallback((alertId: string) => {
    void alertId; // alertId tracked for future persistence
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const clearAll = useCallback(() => {
    setToastAlerts([]);
    setUnreadCount(0);
  }, []);

  const toggleNotifications = useCallback((enabled: boolean) => {
    setNotificationsEnabled(enabled);
    if (!enabled) {
      clearAll();
    }
  }, [clearAll]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!('Notification' in window)) {
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  }, []);

  return {
    // Notification State
    toastAlerts,
    unreadCount,
    
    // Actions
    dismissToast,
    markAsRead,
    clearAll,
    
    // Settings
    notificationsEnabled,
    toggleNotifications,
    requestPermission
  };
};

export default useAlerts;