// Alert Types and Interfaces

export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum AlertType {
  SYNC_FAILURE = 'sync_failure',
  CONFLICT_SURGE = 'conflict_surge',
  PERFORMANCE_DEGRADATION = 'performance_degradation',
  DATA_INTEGRITY = 'data_integrity',
  NETWORK_CONNECTIVITY = 'network_connectivity',
  STORAGE_QUOTA = 'storage_quota',
  CUSTOM = 'custom'
}

export enum AlertStatus {
  ACTIVE = 'active',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved',
  SNOOZED = 'snoozed'
}

export enum NotificationChannel {
  IN_APP = 'in_app',
  BROWSER = 'browser',
  EMAIL = 'email',
  SOUND = 'sound'
}

export interface AlertThreshold {
  metric: string;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq';
  value: number;
  window?: number; // Time window in ms
  consecutive?: number; // Number of consecutive violations
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  type: AlertType;
  severity: AlertSeverity;
  enabled: boolean;
  thresholds: AlertThreshold[];
  channels: NotificationChannel[];
  cooldown?: number; // Minimum time between alerts in ms
  groupBy?: string[]; // Fields to group alerts by
  metadata?: Record<string, unknown>;
}

export interface Alert {
  id: string;
  ruleId: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  details?: Record<string, unknown>;
  createdAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  snoozedUntil?: Date;
  acknowledgedBy?: string;
  resolvedBy?: string;
  groupKey?: string;
  count: number; // For grouped alerts
  lastOccurrence: Date;
  firstOccurrence: Date;
}

export interface AlertNotification {
  alertId: string;
  channel: NotificationChannel;
  sentAt: Date;
  delivered: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface AlertPreferences {
  userId: string;
  channels: {
    [key in NotificationChannel]?: {
      enabled: boolean;
      severities: AlertSeverity[];
      types?: AlertType[];
    };
  };
  quiet: {
    enabled: boolean;
    start?: string; // HH:MM format
    end?: string; // HH:MM format
    days?: number[]; // 0-6 (Sunday-Saturday)
  };
  email?: string;
  soundEnabled?: boolean;
}

export interface AlertStatistics {
  total: number;
  bySeverity: Record<AlertSeverity, number>;
  byType: Record<AlertType, number>;
  byStatus: Record<AlertStatus, number>;
  recentAlerts: Alert[];
  topRules: Array<{
    ruleId: string;
    count: number;
    name: string;
  }>;
}

export interface AlertConfig {
  defaultRules: AlertRule[];
  retentionDays: number;
  maxAlertsPerRule: number;
  emailProvider?: {
    apiKey: string;
    from: string;
    templateId?: string;
  };
  soundUrl?: string;
  debounceMs: number;
  throttleMs: number;
}

export type AlertListener = (alert: Alert) => void;
export type AlertFilter = (alert: Alert) => boolean;

export interface AlertQuery {
  status?: AlertStatus[];
  severity?: AlertSeverity[];
  type?: AlertType[];
  ruleId?: string[];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'severity' | 'status';
  sortOrder?: 'asc' | 'desc';
}