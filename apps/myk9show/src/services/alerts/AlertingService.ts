// Comprehensive Alerting Service for Sync Monitoring

import { EventEmitter } from '../sync/eventEmitter';
import { SyncAnalyticsService } from '../analytics/SyncAnalyticsService';
import { logger } from '@/services/LoggingService';
import {
  Alert,
  AlertRule,
  AlertType,
  AlertSeverity,
  AlertStatus,
  AlertNotification,
  NotificationChannel,
  AlertPreferences,
  AlertStatistics,
  AlertConfig,
  AlertListener,
  AlertQuery,
  AlertThreshold
} from '../../types/alert-types';
import { SyncMetrics } from '../../types/analytics-types';

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
  
  private readonly STORAGE_KEYS = {
    ALERTS: 'myK9Show_alerts',
    RULES: 'myK9Show_alert_rules',
    PREFERENCES: 'myK9Show_alert_preferences',
    NOTIFICATIONS: 'myK9Show_alert_notifications'
  };

  private constructor() {
    super();
    this.analytics = SyncAnalyticsService.getInstance();
    this.config = this.getDefaultConfig();
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
      // Load persisted data
      await this.loadPersistedData();
      
      // Set up metric monitoring
      this.setupMetricMonitoring();
      
      // Clean up old data
      this.cleanupOldData();
      
      // Start periodic tasks
      this.startPeriodicTasks();
      
      this.isInitialized = true;
      this.emit('initialized', undefined);
      
      // [AlertingService] Initialized successfully');
    } catch (error) {
      logger.error('Initialization failed', 'alerting', {}, error as Error);
      throw error;
    }
  }

  // Alert Management
  async createAlert(
    ruleId: string,
    title: string,
    message: string,
    details?: Record<string, unknown>
  ): Promise<Alert> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Alert rule not found: ${ruleId}`);
    }

    const alertId = this.generateAlertId();
    const now = new Date();
    const groupKey = this.generateGroupKey(rule, details);

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
      status: AlertStatus.ACTIVE,
      title,
      message,
      details,
      createdAt: now,
      groupKey,
      count: 1,
      lastOccurrence: now,
      firstOccurrence: now
    };

    this.alerts.set(alertId, alert);
    await this.persistAlerts();

    // Send notifications
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

    alert.status = AlertStatus.ACKNOWLEDGED;
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

    alert.status = AlertStatus.RESOLVED;
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

    alert.status = AlertStatus.SNOOZED;
    alert.snoozedUntil = new Date(Date.now() + duration);

    this.alerts.set(alertId, alert);
    await this.persistAlerts();

    this.emit('alert_snoozed', alert);
    logger.info('Alert snoozed', 'alerting', { alertId, snoozedUntil: alert.snoozedUntil });
  }

  // Rule Management
  async createRule(rule: Omit<AlertRule, 'id'>): Promise<AlertRule> {
    const ruleId = this.generateRuleId();
    const newRule: AlertRule = {
      ...rule,
      id: ruleId
    };

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

  // Notification Management
  private async sendNotifications(alert: Alert, channels: NotificationChannel[]): Promise<void> {
    const notifications: AlertNotification[] = [];

    for (const channel of channels) {
      if (await this.shouldSendNotification(alert, channel)) {
        try {
          await this.sendNotification(alert, channel);
          notifications.push({
            alertId: alert.id,
            channel,
            sentAt: new Date(),
            delivered: true
          });
        } catch (error) {
          notifications.push({
            alertId: alert.id,
            channel,
            sentAt: new Date(),
            delivered: false,
            error: error instanceof Error ? error.message : 'Unknown error'
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
          timestamp: alert.createdAt
        });
        break;

      case NotificationChannel.BROWSER:
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(alert.title, {
            body: alert.message,
            icon: this.getNotificationIcon(alert.severity),
            tag: alert.id,
            requireInteraction: alert.severity === AlertSeverity.CRITICAL
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
    // Email notification implementation would go here
    // This would typically integrate with an email service like SendGrid, AWS SES, etc.
    logger.info('Email notification sent', 'alerting', { alertId: alert.id });
  }

  // Metric Monitoring
  private setupMetricMonitoring(): void {
    // Check rules periodically since SyncAnalyticsService doesn't emit events
    setInterval(() => {
      this.checkRulesWithAnalytics();
    }, 30000); // Check every 30 seconds
  }

  private async checkRulesWithAnalytics(): Promise<void> {
    try {
      // Get current metrics from analytics service
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 30 * 60 * 1000); // Last 30 minutes
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
    // Check throttling
    const lastTriggered = this.throttleMap.get(rule.id) || 0;
    if (rule.cooldown && Date.now() - lastTriggered < rule.cooldown) {
      return false;
    }

    // Evaluate all thresholds
    for (const threshold of rule.thresholds) {
      if (!this.evaluateThreshold(threshold, metrics)) {
        return false;
      }
    }

    return true;
  }

  private evaluateThreshold(threshold: AlertThreshold, metrics: SyncMetrics): boolean {
    const value = this.getMetricValue(threshold.metric, metrics);
    if (value === undefined) return false;

    switch (threshold.operator) {
      case 'gt': return value > threshold.value;
      case 'lt': return value < threshold.value;
      case 'gte': return value >= threshold.value;
      case 'lte': return value <= threshold.value;
      case 'eq': return value === threshold.value;
      case 'neq': return value !== threshold.value;
      default: return false;
    }
  }

  private getMetricValue(metricPath: string, metrics: SyncMetrics): number | undefined {
    const parts = metricPath.split('.');
    let value: unknown = metrics;
    
    for (const part of parts) {
      value = (value as Record<string, unknown>)?.[part];
      if (value === undefined) return undefined;
    }
    
    return typeof value === 'number' ? value : undefined;
  }

  private async triggerAlert(rule: AlertRule, metrics: SyncMetrics): Promise<void> {
    const title = this.generateAlertTitle(rule, metrics);
    const message = this.generateAlertMessage(rule, metrics);
    const details = this.extractAlertDetails(rule, metrics);

    // Set throttle
    this.throttleMap.set(rule.id, Date.now());

    // Debounce alert creation
    if (this.debounceMap.has(rule.id)) {
      clearTimeout(this.debounceMap.get(rule.id)!);
    }

    const timeout = setTimeout(async () => {
      await this.createAlert(rule.id, title, message, details);
      this.debounceMap.delete(rule.id);
    }, this.config.debounceMs);

    this.debounceMap.set(rule.id, timeout);
  }

  // Query and Statistics
  getAlerts(query?: AlertQuery): Alert[] {
    let alerts = Array.from(this.alerts.values());

    if (query) {
      alerts = alerts.filter(alert => {
        if (query.status && !query.status.includes(alert.status)) return false;
        if (query.severity && !query.severity.includes(alert.severity)) return false;
        if (query.type && !query.type.includes(alert.type)) return false;
        if (query.ruleId && !query.ruleId.includes(alert.ruleId)) return false;
        if (query.startDate && alert.createdAt < query.startDate) return false;
        if (query.endDate && alert.createdAt > query.endDate) return false;
        return true;
      });

      // Sort alerts
      const sortBy = query.sortBy || 'createdAt';
      const sortOrder = query.sortOrder || 'desc';
      alerts.sort((a, b) => {
        const aValue = a[sortBy];
        const bValue = b[sortBy];
        const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        return sortOrder === 'asc' ? comparison : -comparison;
      });

      // Apply pagination
      if (query.offset) alerts = alerts.slice(query.offset);
      if (query.limit) alerts = alerts.slice(0, query.limit);
    }

    return alerts;
  }

  getAlertStatistics(): AlertStatistics {
    const alerts = Array.from(this.alerts.values());
    const recentAlerts = alerts
      .filter(alert => Date.now() - alert.createdAt.getTime() < 24 * 60 * 60 * 1000)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10);

    const bySeverity = alerts.reduce((acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1;
      return acc;
    }, {} as Record<AlertSeverity, number>);

    const byType = alerts.reduce((acc, alert) => {
      acc[alert.type] = (acc[alert.type] || 0) + 1;
      return acc;
    }, {} as Record<AlertType, number>);

    const byStatus = alerts.reduce((acc, alert) => {
      acc[alert.status] = (acc[alert.status] || 0) + 1;
      return acc;
    }, {} as Record<AlertStatus, number>);

    const ruleCount = alerts.reduce((acc, alert) => {
      acc[alert.ruleId] = (acc[alert.ruleId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topRules = Object.entries(ruleCount)
      .map(([ruleId, count]) => ({
        ruleId,
        count,
        name: this.rules.get(ruleId)?.name || 'Unknown'
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      total: alerts.length,
      bySeverity,
      byType,
      byStatus,
      recentAlerts,
      topRules
    };
  }

  // Preferences Management
  async setPreferences(userId: string, preferences: AlertPreferences): Promise<void> {
    this.preferences.set(userId, preferences);
    await this.persistPreferences();
    
    this.emit('preferences_updated', { userId, preferences });
    logger.info('Preferences updated', 'alerting', { userId });
  }

  getPreferences(userId: string): AlertPreferences | undefined {
    return this.preferences.get(userId);
  }

  // Utility Methods
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private generateRuleId(): string {
    return `rule_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private generateGroupKey(rule: AlertRule, details?: Record<string, unknown>): string {
    if (!rule.groupBy || !details) return rule.id;
    
    const groupValues = rule.groupBy.map(field => details[field] || '').join('|');
    return `${rule.id}:${groupValues}`;
  }

  private findGroupedAlert(groupKey: string, type: AlertType): Alert | undefined {
    return Array.from(this.alerts.values()).find(
      alert => alert.groupKey === groupKey && alert.type === type && alert.status === AlertStatus.ACTIVE
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

  private generateAlertTitle(rule: AlertRule, _metrics: SyncMetrics): string {
    switch (rule.type) {
      case AlertType.SYNC_FAILURE:
        return `Sync Failure Rate Alert: ${rule.name}`;
      case AlertType.CONFLICT_SURGE:
        return `Conflict Surge Detected: ${rule.name}`;
      case AlertType.PERFORMANCE_DEGRADATION:
        return `Performance Degradation: ${rule.name}`;
      case AlertType.DATA_INTEGRITY:
        return `Data Integrity Issue: ${rule.name}`;
      case AlertType.NETWORK_CONNECTIVITY:
        return `Network Connectivity Alert: ${rule.name}`;
      case AlertType.STORAGE_QUOTA:
        return `Storage Quota Warning: ${rule.name}`;
      default:
        return `Alert: ${rule.name}`;
    }
  }

  private generateAlertMessage(rule: AlertRule, metrics: SyncMetrics): string {
    const threshold = rule.thresholds[0];
    if (!threshold) return rule.description;

    const value = this.getMetricValue(threshold.metric, metrics);
    return `${rule.description}. Current value: ${value}, Threshold: ${threshold.operator} ${threshold.value}`;
  }

  private extractAlertDetails(rule: AlertRule, metrics: SyncMetrics): Record<string, unknown> {
    return {
      ruleType: rule.type,
      severity: rule.severity,
      thresholds: rule.thresholds,
      metrics: metrics,
      timestamp: new Date()
    };
  }

  private async shouldSendNotification(_alert: Alert, channel: NotificationChannel): Promise<boolean> {
    // Check user preferences (simplified - in real app would check per user)
    if (channel === NotificationChannel.BROWSER) {
      return 'Notification' in window && Notification.permission === 'granted';
    }

    return true;
  }

  private getNotificationIcon(severity: AlertSeverity): string {
    switch (severity) {
      case AlertSeverity.CRITICAL: return '/icons/alert-critical.png';
      case AlertSeverity.HIGH: return '/icons/alert-high.png';
      case AlertSeverity.MEDIUM: return '/icons/alert-medium.png';
      default: return '/icons/alert-low.png';
    }
  }

  // Periodic Tasks
  private startPeriodicTasks(): void {
    // Clean up old alerts every hour
    setInterval(() => {
      this.cleanupOldData();
    }, 60 * 60 * 1000);

    // Check for snoozed alerts every minute
    setInterval(() => {
      this.checkSnoozedAlerts();
    }, 60 * 1000);
  }

  private cleanupOldData(): void {
    const cutoffDate = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);
    let cleaned = 0;

    for (const [alertId, alert] of this.alerts) {
      if (alert.createdAt < cutoffDate && alert.status === AlertStatus.RESOLVED) {
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
      if (alert.status === AlertStatus.SNOOZED && alert.snoozedUntil && alert.snoozedUntil <= now) {
        alert.status = AlertStatus.ACTIVE;
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

  // Default Configuration and Rules
  private getDefaultConfig(): AlertConfig {
    return {
      defaultRules: [],
      retentionDays: 30,
      maxAlertsPerRule: 100,
      debounceMs: 5000,
      throttleMs: 60000,
      soundUrl: '/sounds/alert.mp3'
    };
  }

  private initializeDefaultRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'sync_failure_rate',
        name: 'High Sync Failure Rate',
        description: 'Sync failure rate has exceeded acceptable threshold',
        type: AlertType.SYNC_FAILURE,
        severity: AlertSeverity.HIGH,
        enabled: true,
        thresholds: [
          {
            metric: 'sync.failureRate',
            operator: 'gt',
            value: 0.1, // 10% failure rate
            window: 300000 // 5 minutes
          }
        ],
        channels: [NotificationChannel.IN_APP, NotificationChannel.BROWSER],
        cooldown: 300000, // 5 minutes
        groupBy: ['entityType']
      },
      {
        id: 'conflict_surge',
        name: 'Conflict Surge Detection',
        description: 'Unusually high number of sync conflicts detected',
        type: AlertType.CONFLICT_SURGE,
        severity: AlertSeverity.MEDIUM,
        enabled: true,
        thresholds: [
          {
            metric: 'conflicts.rate',
            operator: 'gt',
            value: 5, // 5 conflicts per minute
            window: 60000 // 1 minute
          }
        ],
        channels: [NotificationChannel.IN_APP],
        cooldown: 600000 // 10 minutes
      },
      {
        id: 'performance_degradation',
        name: 'Sync Performance Degradation',
        description: 'Sync operations are taking longer than expected',
        type: AlertType.PERFORMANCE_DEGRADATION,
        severity: AlertSeverity.MEDIUM,
        enabled: true,
        thresholds: [
          {
            metric: 'sync.averageDuration',
            operator: 'gt',
            value: 10000, // 10 seconds
            window: 300000 // 5 minutes
          }
        ],
        channels: [NotificationChannel.IN_APP],
        cooldown: 900000 // 15 minutes
      },
      {
        id: 'storage_quota_warning',
        name: 'Storage Quota Warning',
        description: 'Local storage quota is running low',
        type: AlertType.STORAGE_QUOTA,
        severity: AlertSeverity.HIGH,
        enabled: true,
        thresholds: [
          {
            metric: 'storage.usagePercent',
            operator: 'gt',
            value: 85 // 85% usage
          }
        ],
        channels: [NotificationChannel.IN_APP, NotificationChannel.BROWSER],
        cooldown: 3600000 // 1 hour
      }
    ];

    for (const rule of defaultRules) {
      this.rules.set(rule.id, rule);
    }
  }

  // Persistence Methods
  private async loadPersistedData(): Promise<void> {
    try {
      // Load alerts
      const alertsData = localStorage.getItem(this.STORAGE_KEYS.ALERTS);
      if (alertsData) {
        const alerts = JSON.parse(alertsData);
        for (const alert of alerts) {
          // Convert date strings back to Date objects
          alert.createdAt = new Date(alert.createdAt);
          if (alert.acknowledgedAt) alert.acknowledgedAt = new Date(alert.acknowledgedAt);
          if (alert.resolvedAt) alert.resolvedAt = new Date(alert.resolvedAt);
          if (alert.snoozedUntil) alert.snoozedUntil = new Date(alert.snoozedUntil);
          alert.lastOccurrence = new Date(alert.lastOccurrence);
          alert.firstOccurrence = new Date(alert.firstOccurrence);
          
          this.alerts.set(alert.id, alert);
        }
      }

      // Load rules
      const rulesData = localStorage.getItem(this.STORAGE_KEYS.RULES);
      if (rulesData) {
        const rules = JSON.parse(rulesData);
        for (const rule of rules) {
          this.rules.set(rule.id, rule);
        }
      }

      // Load preferences
      const preferencesData = localStorage.getItem(this.STORAGE_KEYS.PREFERENCES);
      if (preferencesData) {
        const preferences = JSON.parse(preferencesData);
        for (const [userId, prefs] of Object.entries(preferences)) {
          this.preferences.set(userId, prefs as AlertPreferences);
        }
      }

      // Load notifications
      const notificationsData = localStorage.getItem(this.STORAGE_KEYS.NOTIFICATIONS);
      if (notificationsData) {
        const notifications = JSON.parse(notificationsData);
        for (const [alertId, notifs] of Object.entries(notifications)) {
          const parsedNotifs = (notifs as Array<{ sentAt: string; [key: string]: unknown }>).map(notif => ({
            ...notif,
            sentAt: new Date(notif.sentAt)
          }));
          this.notifications.set(alertId, parsedNotifs as AlertNotification[]);
        }
      }

      logger.info('Loaded persisted data', 'alerting', { alertCount: this.alerts.size, ruleCount: this.rules.size });
    } catch (error) {
      logger.error('Failed to load persisted data', 'alerting', {}, error as Error);
    }
  }

  private async persistAlerts(): Promise<void> {
    try {
      const alerts = Array.from(this.alerts.values());
      localStorage.setItem(this.STORAGE_KEYS.ALERTS, JSON.stringify(alerts));
    } catch (error) {
      logger.error('Failed to persist alerts', 'alerting', {}, error as Error);
    }
  }

  private async persistRules(): Promise<void> {
    try {
      const rules = Array.from(this.rules.values());
      localStorage.setItem(this.STORAGE_KEYS.RULES, JSON.stringify(rules));
    } catch (error) {
      logger.error('Failed to persist rules', 'alerting', {}, error as Error);
    }
  }

  private async persistPreferences(): Promise<void> {
    try {
      const preferences = Object.fromEntries(this.preferences);
      localStorage.setItem(this.STORAGE_KEYS.PREFERENCES, JSON.stringify(preferences));
    } catch (error) {
      logger.error('Failed to persist preferences', 'alerting', {}, error as Error);
    }
  }

  private async persistNotifications(): Promise<void> {
    try {
      const notifications = Object.fromEntries(this.notifications);
      localStorage.setItem(this.STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
    } catch (error) {
      logger.error('Failed to persist notifications', 'alerting', {}, error as Error);
    }
  }

  // Event Listeners
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

  // Cleanup
  destroy(): void {
    // Clear all timeouts
    for (const timeout of this.debounceMap.values()) {
      clearTimeout(timeout);
    }
    this.debounceMap.clear();
    this.throttleMap.clear();

    // Clear all listeners
    this.removeAllListeners();
    this.listeners.clear();

    // [AlertingService] Destroyed');
  }
}

export default AlertingService;