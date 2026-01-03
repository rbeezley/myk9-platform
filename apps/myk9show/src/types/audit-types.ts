/**
 * Comprehensive audit trail types for Foundation Phase
 * Supports all role workflows and admin troubleshooting
 */

export enum AuditAction {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  LOGIN = 'login',
  LOGOUT = 'logout',
  IMPERSONATE_START = 'impersonate_start',
  IMPERSONATE_END = 'impersonate_end',
  EXPORT = 'export',
  IMPORT = 'import',
  SYSTEM_ACTION = 'system_action'
}

export interface AuditEntry {
  id: string;
  timestamp: Date;
  
  // User information
  userId?: string;
  userRole?: string;
  impersonatingUserId?: string; // Admin user doing impersonation
  sessionId?: string;
  
  // Action details
  action: AuditAction;
  entityType: string;
  entityId: string;
  
  // Change tracking
  changes?: Record<string, {
    from: unknown;
    to: unknown;
  }>;
  
  // Context information
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  
  // Metadata
  metadata?: Record<string, unknown>;
}

export interface AuditEntryInput {
  userId?: string;
  userRole?: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  metadata?: Record<string, unknown>;
}

export interface AuditSearchFilters {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  action?: AuditAction;
  entityType?: string;
  entityId?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditSearchResult {
  entries: AuditEntry[];
  totalCount: number;
  page: number;
  pageSize: number;
}

// Impersonation session tracking
export interface ImpersonationContext {
  id: string;
  originalUserId: string;
  targetUserId: string;
  sessionId: string;
  startedAt: Date;
  expiresAt: Date;
  reason: string;
  isActive: boolean;
}

export interface ImpersonationSession {
  id: string;
  adminUserId: string;
  targetUserId: string;
  reason: string;
  startedAt: Date;
  endedAt?: Date;
  sessionToken: string;
  metadata?: Record<string, unknown>;
}

// System health and monitoring types
export interface SystemMetrics {
  timestamp: Date;
  responseTime: {
    avg: number;
    p95: number;
    p99: number;
  };
  errorRate: number;
  errorCount: number;
  activeUsers: number;
  userSessions: number;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
}

export interface ErrorMetric {
  id: string;
  timestamp: Date;
  name: string;
  message: string;
  stack?: string;
  userId?: string;
  endpoint?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolved: boolean;
}

export interface UserActionMetric {
  id: string;
  timestamp: Date;
  userId: string;
  action: string;
  component: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}

// Notification system types for real-time communication
export enum NotificationType {
  STATUS_UPDATE = 'status_update',
  RESULT_PUBLICATION = 'result_publication',
  ENTRY_CHANGE = 'entry_change',
  SYSTEM_ALERT = 'system_alert',
  USER_ACTION = 'user_action',
  NOTIFICATION = 'notification',
  INFO = 'info'
}

export interface NotificationMessage {
  id: string;
  type: NotificationType;
  channel: string;
  timestamp: Date;
  sender: {
    id: string;
    name: string;
    role: string;
  };
  data: unknown;
}

export interface NotificationSubscription {
  userId: string;
  channels: string[];
  preferences: {
    email: boolean;
    push: boolean;
    inApp: boolean;
  };
}

// Database change tracking for admin monitoring
export interface DatabaseChange {
  id: string;
  timestamp: Date;
  table: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  recordId: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  userId?: string;
  source: 'api' | 'admin' | 'system';
}

export interface SystemAlert {
  id: string;
  timestamp: Date;
  type: 'error' | 'warning' | 'info';
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}