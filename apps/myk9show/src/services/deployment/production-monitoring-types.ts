/**
 * Production Monitoring Types
 *
 * Type definitions for error tracking, performance monitoring,
 * user analytics, and alert management used by ProductionMonitoringService.
 */

import type {
  MetricType,
  NotificationChannel,
  Severity
} from '../../types/deployment-types';

// === Error Tracking ===

export interface ErrorReport {
  id: string;
  message: string;
  stack: string;
  timestamp: Date;
  level: 'error' | 'warning' | 'info' | 'debug';
  context: ErrorContext;
  fingerprint: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  resolved: boolean;
  tags: Record<string, string>;
}

export interface ErrorContext {
  userId?: string;
  sessionId: string;
  userAgent: string;
  url: string;
  component?: string;
  action?: string;
  additionalData?: Record<string, unknown>;
  breadcrumbs: Breadcrumb[];
}

export interface Breadcrumb {
  timestamp: Date;
  type: 'navigation' | 'click' | 'error' | 'api' | 'console';
  message: string;
  data?: Record<string, unknown>;
}

// === Performance Monitoring ===

export interface PerformanceMetric {
  id: string;
  name: string;
  type: MetricType;
  value: number;
  unit: string;
  timestamp: Date;
  tags: Record<string, string>;
  source: 'browser' | 'server' | 'synthetic';
}

export interface WebVitalsReport {
  sessionId: string;
  url: string;
  timestamp: Date;
  metrics: {
    fcp: number; // First Contentful Paint
    lcp: number; // Largest Contentful Paint
    fid: number; // First Input Delay
    cls: number; // Cumulative Layout Shift
    ttfb: number; // Time to First Byte
  };
  deviceInfo: {
    type: 'mobile' | 'desktop' | 'tablet';
    connection: string;
    memory?: number;
  };
}

export interface TransactionTrace {
  id: string;
  name: string;
  startTime: Date;
  duration: number;
  status: 'success' | 'error' | 'timeout';
  spans: TraceSpan[];
  tags: Record<string, string>;
  context: Record<string, unknown>;
}

export interface TraceSpan {
  id: string;
  parentId?: string;
  operation: string;
  startTime: Date;
  duration: number;
  tags: Record<string, string>;
  logs: SpanLog[];
}

export interface SpanLog {
  timestamp: Date;
  level: string;
  message: string;
  fields: Record<string, unknown>;
}

// === User Analytics ===

export interface UserEvent {
  id: string;
  event: string;
  userId?: string;
  sessionId: string;
  timestamp: Date;
  properties: Record<string, unknown>;
  deviceInfo: DeviceInfo;
  location?: LocationInfo;
}

export interface DeviceInfo {
  type: 'mobile' | 'desktop' | 'tablet';
  os: string;
  browser: string;
  version: string;
  screen: {
    width: number;
    height: number;
  };
}

export interface LocationInfo {
  country: string;
  region: string;
  city: string;
  timezone: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface UserSession {
  id: string;
  userId?: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  pageViews: number;
  events: number;
  deviceInfo: DeviceInfo;
  referrer?: string;
  utm: {
    source?: string;
    medium?: string;
    campaign?: string;
  };
}

// === Alert Management ===

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  metric: string;
  condition: AlertCondition;
  threshold: number;
  severity: Severity;
  enabled: boolean;
  channels: NotificationChannel[];
  cooldown: number; // minutes
  lastTriggered?: Date;
}

export interface AlertCondition {
  operator: 'gt' | 'lt' | 'eq' | 'ne' | 'gte' | 'lte';
  timeWindow: number; // minutes
  aggregation: 'avg' | 'sum' | 'min' | 'max' | 'count';
}

export interface Alert {
  id: string;
  ruleId: string;
  triggered: Date;
  resolved?: Date;
  severity: Severity;
  message: string;
  value: number;
  threshold: number;
  context: Record<string, unknown>;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}
