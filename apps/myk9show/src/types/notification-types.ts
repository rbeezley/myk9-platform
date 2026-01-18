/**
 * Notification types and interfaces for FCM integration
 */

// FCM message payload types
export interface FCMMessage {
  notification?: {
    title: string;
    body: string;
    image?: string;
  };
  data?: Record<string, string>;
  token?: string;
  tokens?: string[];
  topic?: string;
  condition?: string;
}

// Notification template types
export type NotificationTemplateKey = 
  | 'SHOW_REMINDER'
  | 'ENTRY_DEADLINE'
  | 'RESULT_UPDATE'
  | 'SCHEDULE_CHANGE'
  | 'JUDGE_ASSIGNMENT'
  | 'EMERGENCY_ALERT'
  | 'PAYMENT_REMINDER'
  | 'ENTRY_CONFIRMATION';

// Notification action types
export interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
  url?: string;
}

// Base notification payload
export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  tag?: string;
  requireInteraction?: boolean;
  silent?: boolean;
  timestamp?: number;
  actions?: NotificationAction[];
  data?: Record<string, unknown>;
  url?: string; // Click-through URL
}

// Template-specific data interfaces
export interface ShowReminderData {
  showId: string;
  showName: string;
  location: string;
  startDate: string;
  checkInTime: string;
  hoursUntil: number;
}

export interface EntryDeadlineData {
  showId: string;
  showName: string;
  deadlineDate: string;
  hoursLeft: number;
  entryUrl: string;
}

export interface ResultUpdateData {
  showId: string;
  classId: string;
  className: string;
  dogId: string;
  dogName: string;
  placement: string;
  judgeName: string;
  ownerName: string;
}

export interface ScheduleChangeData {
  showId: string;
  showName: string;
  changeType: 'time' | 'judge' | 'location' | 'cancellation';
  changeSummary: string;
  affectedClasses: string[];
  newScheduleUrl: string;
}

export interface JudgeAssignmentData {
  showId: string;
  showName: string;
  judgeId: string;
  judgeName: string;
  assignedClasses: string[];
  assignmentDate: string;
}

export interface EmergencyAlertData {
  showId?: string | undefined;
  alertType: 'weather' | 'venue' | 'health' | 'general';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  actionRequired?: boolean;
  expiresAt?: string;
}

// User notification preferences
export interface NotificationPreferences {
  userId: string;
  enabled: boolean;
  fcmToken?: string;
  
  // Notification type preferences
  types: {
    showReminders: boolean;
    entryDeadlines: boolean;
    resultUpdates: boolean;
    scheduleChanges: boolean;
    judgeAssignments: boolean;
    emergencyAlerts: boolean;
    paymentReminders: boolean;
    entryConfirmations: boolean;
  };
  
  // Timing preferences
  timing: {
    showReminderHours: number[]; // [24, 48, 72] hours before
    entryDeadlineHours: number[]; // [24, 48] hours before
    quietHours: {
      enabled: boolean;
      startTime: string; // "22:00"
      endTime: string;   // "08:00"
      timezone: string;  // "America/New_York"
    };
  };
  
  // Delivery preferences
  delivery: {
    browser: boolean;
    email: boolean; // Backup delivery method
    sms: boolean;   // For critical alerts only
  };
  
  // Subscription topics (for efficient targeting)
  topics: string[]; // ["show-123", "judge-456", "exhibitor-notifications"]
  
  createdAt: Date;
  updatedAt: Date;
}

// FCM token storage
export interface FCMTokenRecord {
  userId: string;
  token: string;
  deviceType: 'web' | 'android' | 'ios';
  deviceInfo?: {
    userAgent?: string;
    platform?: string;
    browser?: string;
  };
  isActive: boolean;
  lastUsed: Date;
  createdAt: Date;
}

// Notification delivery status
export interface NotificationDeliveryStatus {
  id: string;
  userId: string;
  templateKey: NotificationTemplateKey;
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'clicked';
  fcmMessageId?: string;
  error?: string;
  sentAt?: Date;
  deliveredAt?: Date;
  clickedAt?: Date;
  retryCount: number;
  metadata?: Record<string, unknown>;
}

// Event-driven notification triggers
export interface NotificationTrigger {
  id: string;
  eventType: string; // 'show.created', 'entry.deadline.approaching', etc.
  templateKey: NotificationTemplateKey;
  conditions: Record<string, unknown>; // Trigger conditions
  targetAudience: {
    userIds?: string[];
    roles?: string[];
    topics?: string[];
    conditions?: Record<string, unknown>;
  };
  timing: {
    immediate?: boolean;
    scheduledFor?: Date;
    offsetHours?: number; // Relative to event time
  };
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// Analytics and reporting
export interface NotificationMetrics {
  templateKey: NotificationTemplateKey;
  period: {
    startDate: Date;
    endDate: Date;
  };
  stats: {
    sent: number;
    delivered: number;
    clicked: number;
    failed: number;
    deliveryRate: number; // delivered / sent
    clickThroughRate: number; // clicked / delivered
    errorRate: number; // failed / sent
  };
  topErrors?: Array<{
    error: string;
    count: number;
  }>;
}

// Service worker message types
export interface ServiceWorkerMessage {
  type: 'FCM_TOKEN_UPDATE' | 'NOTIFICATION_CLICKED' | 'NOTIFICATION_CLOSED';
  payload: unknown;
}

// Background sync for offline notification queuing
export interface QueuedNotification {
  id: string;
  userId: string;
  payload: NotificationPayload;
  templateKey: NotificationTemplateKey;
  templateData: unknown;
  scheduledFor: Date;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
}

export default NotificationPayload;