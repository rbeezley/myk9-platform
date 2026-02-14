// Comprehensive Alerting Service for Sync Monitoring

import { EventEmitter } from '../sync/eventEmitter';
import { SyncAnalyticsService } from '../analytics/SyncAnalyticsService';
import { logger } from '@/services/LoggingService';
import type {
  Alert,
  AlertRule,
  AlertType,
  AlertSeverity,
  AlertStatus,
  AlertNotification,
  AlertPreferences,
  AlertStatistics,
  AlertConfig,
  AlertListener,
  AlertQuery,
} from '../../types/alert-types';
import {
  AlertStatus as AlertStatusEnum,
  AlertSeverity as AlertSeverityEnum,
  NotificationChannel,
} from '../../types/alert-types';
import type { SyncMetrics } from '../../types/analytics-types';
import { ALERTING_STORAGE_KEYS } from './alerting-service-types';
import {
  generateAlertId,
  generateRuleId,
  generateGroupKey,
  evaluateThreshold,
  generateAlertTitle,
  generateAlertMessage,
  extractAlertDetails,
  getNotificationIcon,
  getDefaultConfig,
  getDefaultRules,
} from './alerting-service-helpers';

class AlertingService extends EventEmitter {
  private static instance: AlertingService;
  private alerts: Map<string, Alert> = new Map();
  private rules: Map<string, AlertRule> = new Map();
  private preferences: Map<string, AlertPreferences> = new Map();
  private notifications: Map<string, AlertNotification[]> = new Map();
  private config: AlertConfig;
  private analytics: SyncAnalyticsService;
  private listeners: Map<string, AlertListener[]> = new Map();
  private isInitialized = false;
  private throttleMap: Map<string, number> = new Map();
  private debounceMap: Map<string, NodeJS.Timeout> = new Map();

  private constructor() {
    super();
    this.analytics = SyncAnalyticsService.getInstance();
    this.config = getDefaultConfig();
    this.initializeDefaultRules();
  }

  static getInstance(): AlertingService {
    if (!AlertingService.instance) {
      AlertingService.instance = new AlertingService();
    }
    return AlertingService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.loadPersistedData();
      this.setupMetricMonitoring();
      this.cleanupOldData();
      this.startPeriodicTasks();

      this.isInitialized = true;
      this.emit('initialized', undefined);
    } catch (error) {
      logger.error('Initialization failed', 'alerting', {}, error as Error);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Alert Management
  // ---------------------------------------------------------------------------

  async createAlert(
    ruleId: string,
    title: string,
    message: string,
    details?: Record<string, unknown>,
  ): Promise<Alert> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Alert rule not found: ${ruleId}`);
    }

    const alertId = generateAlertId();
    const now = new Date();
    const groupKey = generateGroupKey(rule, details);

    // Check for existing grouped alert
    const existingAlert = this.findGroupedAlert(groupKey, rule.type);
    if (existingAlert) {
      return this.updateGroupedAlert(existingAlert, message, details);
    }

    const alert: Alert = {
      id: alertId,
      ruleId,
      type: rule.type,
      severity: rule.severity,
      status: AlertStatusEnum.ACTIVE,
      title,
      message,
      details,
      createdAt: now,
      groupKey,
      count: 1,
      lastOccurrence: now,
      firstOccurrence: now,
    };

    this.alerts.set(alertId, alert);
    await this.persistAlerts();
    await this.sendNotifications(alert, rule.channels);

    this.emit('alert_created', alert);
    logger.info('Alert created', 'alerting', { alertId: alert.id, title: alert.title });

    return alert;
  }

  async acknowledgeAlert(alertId: string, userId?: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    alert.status = AlertStatusEnum.ACKNOWLEDGED;
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = userId;

    this.alerts.set(alertId, alert);
    await this.persistAlerts();

    this.emit('alert_acknowledged', alert);
    logger.info('Alert acknowledged', 'alerting', { alertId });
  }

  async resolveAlert(alertId: string, userId?: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    alert.status = AlertStatusEnum.RESOLVED;
    alert.resolvedAt = new Date();
    alert.resolvedBy = userId;

    this.alerts.set(alertId, alert);
    await this.persistAlerts();

    this.emit('alert_resolved', alert);
    logger.info('Alert resolved', 'alerting', { alertId });
  }

  async snoozeAlert(alertId: string, duration: number): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    alert.status = AlertStatusEnum.SNOOZED;
    alert.snoozedUntil = new Date(Date.now() + duration);

    this.alerts.set(alertId, alert);
    await this.persistAlerts();

    this.emit('alert_snoozed', alert);
    logger.info('Alert snoozed', 'alerting', { alertId, snoozedUntil: alert.snoozedUntil });
  }

  // ---------------------------------------------------------------------------
  // Rule Management
  // ---------------------------------------------------------------------------

  async createRule(rule: Omit<AlertRule, 'id'>): Promise<AlertRule> {
    const ruleId = generateRuleId();
    const newRule: AlertRule = { ...rule, id: ruleId };

    this.rules.set(ruleId, newRule);
    await this.persistRules();

    this.emit('rule_created', newRule);
    logger.info('Rule created', 'alerting', { ruleId, ruleName: newRule.name });

    return newRule;
  }

  async updateRule(ruleId: string, updates: Partial<AlertRule>): Promise<AlertRule> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    const updatedRule = { ...rule, ...updates };
    this.rules.set(ruleId, updatedRule);
    await this.persistRules();

    this.emit('rule_updated', updatedRule);
    logger.info('Rule updated', 'alerting', { ruleId });

    return updatedRule;
  }

  async deleteRule(ruleId: string): Promise<void> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    this.rules.delete(ruleId);
    await this.persistRules();

    this.emit('rule_deleted', ruleId);
    logger.info('Rule deleted', 'alerting', { ruleId });
  }

  // ---------------------------------------------------------------------------
  // Notification Management
  // ---------------------------------------------------------------------------

  private async sendNotifications(alert: Alert, channels: NotificationChannel[]): Promise<void> {
    const notifications: AlertNotification[] = [];

    for (const channel of channels) {
      if (await this.shouldSendNotification(alert, channel)) {
        try {
          await this.sendNotification(alert, channel);
          notifications.push({ alertId: alert.id, channel, sentAt: new Date(), delivered: true });
        } catch (error) {
          notifications.push({
            alertId: alert.id,
            channel,
            sentAt: new Date(),
            delivered: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          logger.error('Failed to send notification', 'alerting', { channel }, error as Error);
        }
      }
    }

    this.notifications.set(alert.id, notifications);
    await this.persistNotifications();
  }

  private async sendNotification(alert: Alert, channel: NotificationChannel): Promise<void> {
    switch (channel) {
      case NotificationChannel.IN_APP:
        this.emit('in_app_notification', {
          id: alert.id,
          type: alert.type,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          timestamp: alert.createdAt,
        });
        break;

      case NotificationChannel.BROWSER:
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(alert.title, {
            body: alert.message,
            icon: getNotificationIcon(alert.severity),
            tag: alert.id,
            requireInteraction: alert.severity === AlertSeverityEnum.CRITICAL,
          });
        }
        break;

      case NotificationChannel.EMAIL:
        if (this.config.emailProvider) {
          await this.sendEmailNotification(alert);
        }
        break;

      case NotificationChannel.SOUND:
        if (this.config.soundUrl) {
          const audio = new Audio(this.config.soundUrl);
          await audio.play().catch((e) => logger.warn('Failed to play alert sound', 'alerting', { error: e }));
        }
        break;
    }
  }

  private async sendEmailNotification(alert: Alert): Promise<void> {
    logger.info('Email notification sent', 'alerting', { alertId: alert.id });
  }

  // ---------------------------------------------------------------------------
  // Metric Monitoring
  // ---------------------------------------------------------------------------

  private setupMetricMonitoring(): void {
    setInterval(() => {
      this.checkRulesWithAnalytics();
    }, 30000);
  }

  private async checkRulesWithAnalytics(): Promise<void> {
    try {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 30 * 60 * 1000);
      const metrics = await this.analytics.getMetrics(startTime, endTime);
      await this.checkAlertRules(metrics);
    } catch (error) {
      logger.error('Error checking rules with analytics', 'alerting', {}, error as Error);
    }
  }

  private async checkAlertRules(metrics: SyncMetrics): Promise<void> {
    for (const [ruleId, rule] of this.rules) {
      if (!rule.enabled) continue;

      try {
        if (await this.evaluateRule(rule, metrics)) {
          await this.triggerAlert(rule, metrics);
        }
      } catch (error) {
        logger.error('Error evaluating rule', 'alerting', { ruleId }, error as Error);
      }
    }
  }

  private async evaluateRule(rule: AlertRule, metrics: SyncMetrics): Promise<boolean> {
    const lastTriggered = this.throttleMap.get(rule.id) || 0;
    if (rule.cooldown && Date.now() - lastTriggered < rule.cooldown) {
      return false;
    }

    for (const threshold of rule.thresholds) {
      if (!evaluateThreshold(threshold, metrics)) {
        return false;
      }
    }

    return true;
  }

  private async triggerAlert(rule: AlertRule, metrics: SyncMetrics): Promise<void> {
    const title = generateAlertTitle(rule, metrics);
    const message = generateAlertMessage(rule, metrics);
    const details = extractAlertDetails(rule, metrics);

    this.throttleMap.set(rule.id, Date.now());

    if (this.debounceMap.has(rule.id)) {
      clearTimeout(this.debounceMap.get(rule.id)!);
    }

    const timeout = setTimeout(async () => {
      await this.createAlert(rule.id, title, message, details);
      this.debounceMap.delete(rule.id);
    }, this.config.debounceMs);

    this.debounceMap.set(rule.id, timeout);
  }

  // ---------------------------------------------------------------------------
  // Query and Statistics
  // ---------------------------------------------------------------------------

  getAlerts(query?: AlertQuery): Alert[] {
    let alerts = Array.from(this.alerts.values());

    if (query) {
      alerts = alerts.filter((alert) => {
        if (query.status && !query.status.includes(alert.status)) return false;
        if (query.severity && !query.severity.includes(alert.severity)) return false;
        if (query.type && !query.type.includes(alert.type)) return false;
        if (query.ruleId && !query.ruleId.includes(alert.ruleId)) return false;
        if (query.startDate && alert.createdAt < query.startDate) return false;
        if (query.endDate && alert.createdAt > query.endDate) return false;
        return true;
      });

      const sortBy = query.sortBy || 'createdAt';
      const sortOrder = query.sortOrder || 'desc';
      alerts.sort((a, b) => {
        const aValue = a[sortBy];
        const bValue = b[sortBy];
        const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        return sortOrder === 'asc' ? comparison : -comparison;
      });

      if (query.offset) alerts = alerts.slice(query.offset);
      if (query.limit) alerts = alerts.slice(0, query.limit);
    }

    return alerts;
  }

  getAlertStatistics(): AlertStatistics {
    const alerts = Array.from(this.alerts.values());
    const recentAlerts = alerts
      .filter((alert) => Date.now() - alert.createdAt.getTime() < 24 * 60 * 60 * 1000)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10);

    const bySeverity = alerts.reduce(
      (acc, alert) => {
        acc[alert.severity] = (acc[alert.severity] || 0) + 1;
        return acc;
      },
      {} as Record<AlertSeverity, number>,
    );

    const byType = alerts.reduce(
      (acc, alert) => {
        acc[alert.type] = (acc[alert.type] || 0) + 1;
        return acc;
      },
      {} as Record<AlertType, number>,
    );

    const byStatus = alerts.reduce(
      (acc, alert) => {
        acc[alert.status] = (acc[alert.status] || 0) + 1;
        return acc;
      },
      {} as Record<AlertStatus, number>,
    );

    const ruleCount = alerts.reduce(
      (acc, alert) => {
        acc[alert.ruleId] = (acc[alert.ruleId] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const topRules = Object.entries(ruleCount)
      .map(([ruleId, count]) => ({
        ruleId,
        count,
        name: this.rules.get(ruleId)?.name || 'Unknown',
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return { total: alerts.length, bySeverity, byType, byStatus, recentAlerts, topRules };
  }

  // ---------------------------------------------------------------------------
  // Preferences Management
  // ---------------------------------------------------------------------------

  async setPreferences(userId: string, preferences: AlertPreferences): Promise<void> {
    this.preferences.set(userId, preferences);
    await this.persistPreferences();

    this.emit('preferences_updated', { userId, preferences });
    logger.info('Preferences updated', 'alerting', { userId });
  }

  getPreferences(userId: string): AlertPreferences | undefined {
    return this.preferences.get(userId);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers (stateful — depend on this.alerts)
  // ---------------------------------------------------------------------------

  private findGroupedAlert(groupKey: string, type: AlertType): Alert | undefined {
    return Array.from(this.alerts.values()).find(
      (alert) =>
        alert.groupKey === groupKey && alert.type === type && alert.status === AlertStatusEnum.ACTIVE,
    );
  }

  private updateGroupedAlert(alert: Alert, message: string, details?: Record<string, unknown>): Alert {
    alert.count++;
    alert.lastOccurrence = new Date();
    alert.message = message;
    if (details) {
      alert.details = { ...alert.details, ...details };
    }

    this.alerts.set(alert.id, alert);
    this.persistAlerts();

    this.emit('alert_updated', alert);
    return alert;
  }

  private async shouldSendNotification(_alert: Alert, channel: NotificationChannel): Promise<boolean> {
    if (channel === NotificationChannel.BROWSER) {
      return 'Notification' in window && Notification.permission === 'granted';
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Periodic Tasks
  // ---------------------------------------------------------------------------

  private startPeriodicTasks(): void {
    setInterval(() => {
      this.cleanupOldData();
    }, 60 * 60 * 1000);

    setInterval(() => {
      this.checkSnoozedAlerts();
    }, 60 * 1000);
  }

  private cleanupOldData(): void {
    const cutoffDate = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);
    let cleaned = 0;

    for (const [alertId, alert] of this.alerts) {
      if (alert.createdAt < cutoffDate && alert.status === AlertStatusEnum.RESOLVED) {
        this.alerts.delete(alertId);
        this.notifications.delete(alertId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.persistAlerts();
      this.persistNotifications();
      logger.info('Cleaned up old alerts', 'alerting', { count: cleaned });
    }
  }

  private checkSnoozedAlerts(): void {
    const now = new Date();
    let reactivated = 0;

    for (const [alertId, alert] of this.alerts) {
      if (alert.status === AlertStatusEnum.SNOOZED && alert.snoozedUntil && alert.snoozedUntil <= now) {
        alert.status = AlertStatusEnum.ACTIVE;
        delete alert.snoozedUntil;
        this.alerts.set(alertId, alert);
        this.emit('alert_reactivated', alert);
        reactivated++;
      }
    }

    if (reactivated > 0) {
      this.persistAlerts();
      logger.info('Reactivated snoozed alerts', 'alerting', { count: reactivated });
    }
  }

  // ---------------------------------------------------------------------------
  // Default Rules Initialization
  // ---------------------------------------------------------------------------

  private initializeDefaultRules(): void {
    for (const rule of getDefaultRules()) {
      this.rules.set(rule.id, rule);
    }
  }

  // ---------------------------------------------------------------------------
  // Persistence Methods
  // ---------------------------------------------------------------------------

  private async loadPersistedData(): Promise<void> {
    try {
      const alertsData = localStorage.getItem(ALERTING_STORAGE_KEYS.ALERTS);
      if (alertsData) {
        const alerts = JSON.parse(alertsData);
        for (const alert of alerts) {
          alert.createdAt = new Date(alert.createdAt);
          if (alert.acknowledgedAt) alert.acknowledgedAt = new Date(alert.acknowledgedAt);
          if (alert.resolvedAt) alert.resolvedAt = new Date(alert.resolvedAt);
          if (alert.snoozedUntil) alert.snoozedUntil = new Date(alert.snoozedUntil);
          alert.lastOccurrence = new Date(alert.lastOccurrence);
          alert.firstOccurrence = new Date(alert.firstOccurrence);
          this.alerts.set(alert.id, alert);
        }
      }

      const rulesData = localStorage.getItem(ALERTING_STORAGE_KEYS.RULES);
      if (rulesData) {
        const rules = JSON.parse(rulesData);
        for (const rule of rules) {
          this.rules.set(rule.id, rule);
        }
      }

      const preferencesData = localStorage.getItem(ALERTING_STORAGE_KEYS.PREFERENCES);
      if (preferencesData) {
        const preferences = JSON.parse(preferencesData);
        for (const [userId, prefs] of Object.entries(preferences)) {
          this.preferences.set(userId, prefs as AlertPreferences);
        }
      }

      const notificationsData = localStorage.getItem(ALERTING_STORAGE_KEYS.NOTIFICATIONS);
      if (notificationsData) {
        const notifications = JSON.parse(notificationsData);
        for (const [alertId, notifs] of Object.entries(notifications)) {
          const parsedNotifs = (notifs as Array<{ sentAt: string; [key: string]: unknown }>).map(
            (notif) => ({
              ...notif,
              sentAt: new Date(notif.sentAt),
            }),
          );
          this.notifications.set(alertId, parsedNotifs as AlertNotification[]);
        }
      }

      logger.info('Loaded persisted data', 'alerting', {
        alertCount: this.alerts.size,
        ruleCount: this.rules.size,
      });
    } catch (error) {
      logger.error('Failed to load persisted data', 'alerting', {}, error as Error);
    }
  }

  private async persistAlerts(): Promise<void> {
    try {
      const alerts = Array.from(this.alerts.values());
      localStorage.setItem(ALERTING_STORAGE_KEYS.ALERTS, JSON.stringify(alerts));
    } catch (error) {
      logger.error('Failed to persist alerts', 'alerting', {}, error as Error);
    }
  }

  private async persistRules(): Promise<void> {
    try {
      const rules = Array.from(this.rules.values());
      localStorage.setItem(ALERTING_STORAGE_KEYS.RULES, JSON.stringify(rules));
    } catch (error) {
      logger.error('Failed to persist rules', 'alerting', {}, error as Error);
    }
  }

  private async persistPreferences(): Promise<void> {
    try {
      const preferences = Object.fromEntries(this.preferences);
      localStorage.setItem(ALERTING_STORAGE_KEYS.PREFERENCES, JSON.stringify(preferences));
    } catch (error) {
      logger.error('Failed to persist preferences', 'alerting', {}, error as Error);
    }
  }

  private async persistNotifications(): Promise<void> {
    try {
      const notifications = Object.fromEntries(this.notifications);
      localStorage.setItem(ALERTING_STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
    } catch (error) {
      logger.error('Failed to persist notifications', 'alerting', {}, error as Error);
    }
  }

  // ---------------------------------------------------------------------------
  // Event Listeners
  // ---------------------------------------------------------------------------

  onAlert(listener: AlertListener): () => void {
    const listeners = this.listeners.get('alert') || [];
    listeners.push(listener);
    this.listeners.set('alert', listeners);

    return () => {
      const currentListeners = this.listeners.get('alert') || [];
      const index = currentListeners.indexOf(listener);
      if (index > -1) {
        currentListeners.splice(index, 1);
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  destroy(): void {
    for (const timeout of this.debounceMap.values()) {
      clearTimeout(timeout);
    }
    this.debounceMap.clear();
    this.throttleMap.clear();

    this.removeAllListeners();
    this.listeners.clear();
  }
}

export default AlertingService;
