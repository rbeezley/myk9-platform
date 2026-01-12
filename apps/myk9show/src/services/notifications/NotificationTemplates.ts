/**
 * Notification Templates for FCM Push Notifications
 * Defines standardized templates for different types of dog show notifications
 */

import { logger } from '@/services/LoggingService';
import {
  NotificationPayload, 
  NotificationTemplateKey,
  ShowReminderData,
  EntryDeadlineData,
  ResultUpdateData,
  ScheduleChangeData,
  JudgeAssignmentData,
  EmergencyAlertData
} from '@/types/notification-types';

// Template definition interface
interface NotificationTemplate<T = unknown> {
  key: NotificationTemplateKey;
  name: string;
  description: string;
  category: 'reminder' | 'deadline' | 'update' | 'alert' | 'confirmation';
  priority: 'low' | 'medium' | 'high' | 'critical';
  generatePayload: (data: T) => NotificationPayload;
  defaultEnabled: boolean;
  requiresPermission: boolean;
}

/**
 * Show Reminder Template
 * Reminds users about upcoming shows
 */
export const SHOW_REMINDER_TEMPLATE: NotificationTemplate<ShowReminderData> = {
  key: 'SHOW_REMINDER',
  name: 'Show Reminder',
  description: 'Reminds exhibitors about upcoming dog shows',
  category: 'reminder',
  priority: 'medium',
  defaultEnabled: true,
  requiresPermission: true,
  generatePayload: (data: ShowReminderData) => ({
    title: `${data.showName} starts in ${data.hoursUntil} hours`,
    body: `Check-in begins at ${data.checkInTime} at ${data.location}`,
    icon: '/icons/show-reminder.png',
    badge: '/icons/app-badge.png',
    tag: `show-reminder-${data.showId}`,
    requireInteraction: false,
    timestamp: Date.now(),
    actions: [
      {
        action: 'view-details',
        title: 'View Show Details',
        url: `/shows/${data.showId}`
      },
      {
        action: 'get-directions',
        title: 'Get Directions',
        url: `https://maps.google.com/?q=${encodeURIComponent(data.location)}`
      }
    ],
    url: `/shows/${data.showId}`,
    data: {
      templateKey: 'SHOW_REMINDER',
      showId: data.showId,
      showName: data.showName,
      detailsUrl: `/shows/${data.showId}`,
      locationUrl: `https://maps.google.com/?q=${encodeURIComponent(data.location)}`,
      hoursUntil: data.hoursUntil.toString()
    }
  })
};

/**
 * Entry Deadline Template
 * Warns users about approaching entry deadlines
 */
export const ENTRY_DEADLINE_TEMPLATE: NotificationTemplate<EntryDeadlineData> = {
  key: 'ENTRY_DEADLINE',
  name: 'Entry Deadline Warning',
  description: 'Warns about approaching entry deadlines',
  category: 'deadline',
  priority: 'high',
  defaultEnabled: true,
  requiresPermission: true,
  generatePayload: (data: EntryDeadlineData) => ({
    title: `Entry deadline in ${data.hoursLeft} hours!`,
    body: `Complete your entries for ${data.showName} before the deadline`,
    icon: '/icons/deadline-warning.png',
    badge: '/icons/app-badge.png',
    tag: `entry-deadline-${data.showId}`,
    requireInteraction: true,
    timestamp: Date.now(),
    actions: [
      {
        action: 'complete-entry',
        title: 'Complete Entry',
        url: data.entryUrl
      },
      {
        action: 'remind-later',
        title: 'Remind Me in 2 Hours'
      }
    ],
    url: data.entryUrl,
    data: {
      templateKey: 'ENTRY_DEADLINE',
      showId: data.showId,
      showName: data.showName,
      entryUrl: data.entryUrl,
      hoursLeft: data.hoursLeft.toString(),
      deadlineDate: data.deadlineDate
    }
  })
};

/**
 * Result Update Template
 * Notifies users about competition results
 */
export const RESULT_UPDATE_TEMPLATE: NotificationTemplate<ResultUpdateData> = {
  key: 'RESULT_UPDATE',
  name: 'Competition Results',
  description: 'Notifies about competition results and placements',
  category: 'update',
  priority: 'medium',
  defaultEnabled: true,
  requiresPermission: true,
  generatePayload: (data: ResultUpdateData) => ({
    title: `${data.dogName} placed ${data.placement}!`,
    body: `Results posted for ${data.className} judged by ${data.judgeName}`,
    icon: '/icons/results-trophy.png',
    badge: '/icons/app-badge.png',
    tag: `result-${data.classId}`,
    requireInteraction: false,
    timestamp: Date.now(),
    actions: [
      {
        action: 'view-results',
        title: 'View Full Results',
        url: `/shows/${data.showId}/results/${data.classId}`
      },
      {
        action: 'share-result',
        title: 'Share'
      }
    ],
    url: `/shows/${data.showId}/results/${data.classId}`,
    data: {
      templateKey: 'RESULT_UPDATE',
      showId: data.showId,
      classId: data.classId,
      dogId: data.dogId,
      dogName: data.dogName,
      placement: data.placement,
      resultsUrl: `/shows/${data.showId}/results/${data.classId}`,
      shareData: JSON.stringify({
        title: `${data.dogName} placed ${data.placement}!`,
        text: `Great news! ${data.dogName} placed ${data.placement} in ${data.className}`,
        url: `${window.location.origin}/shows/${data.showId}/results/${data.classId}`
      })
    }
  })
};

/**
 * Schedule Change Template
 * Alerts users about schedule modifications
 */
export const SCHEDULE_CHANGE_TEMPLATE: NotificationTemplate<ScheduleChangeData> = {
  key: 'SCHEDULE_CHANGE',
  name: 'Schedule Change Alert',
  description: 'Alerts about important schedule changes',
  category: 'alert',
  priority: 'high',
  defaultEnabled: true,
  requiresPermission: true,
  generatePayload: (data: ScheduleChangeData) => ({
    title: `Schedule Update: ${data.showName}`,
    body: data.changeSummary,
    icon: '/icons/schedule-change.png',
    badge: '/icons/app-badge.png',
    tag: `schedule-change-${data.showId}`,
    requireInteraction: true,
    timestamp: Date.now(),
    actions: [
      {
        action: 'view-schedule',
        title: 'View Updated Schedule',
        url: data.newScheduleUrl
      }
    ],
    url: data.newScheduleUrl,
    data: {
      templateKey: 'SCHEDULE_CHANGE',
      showId: data.showId,
      showName: data.showName,
      changeType: data.changeType,
      changeSummary: data.changeSummary,
      scheduleUrl: data.newScheduleUrl,
      affectedClasses: JSON.stringify(data.affectedClasses)
    }
  })
};

/**
 * Judge Assignment Template
 * Notifies about judge assignments
 */
export const JUDGE_ASSIGNMENT_TEMPLATE: NotificationTemplate<JudgeAssignmentData> = {
  key: 'JUDGE_ASSIGNMENT',
  name: 'Judge Assignment',
  description: 'Notifies about judge assignments and changes',
  category: 'update',
  priority: 'medium',
  defaultEnabled: true,
  requiresPermission: false,
  generatePayload: (data: JudgeAssignmentData) => ({
    title: `Judge Assignment: ${data.showName}`,
    body: `${data.judgeName} assigned to judge ${data.assignedClasses.length} classes`,
    icon: '/icons/judge-assignment.png',
    badge: '/icons/app-badge.png',
    tag: `judge-assignment-${data.showId}-${data.judgeId}`,
    requireInteraction: false,
    timestamp: Date.now(),
    actions: [
      {
        action: 'view-details',
        title: 'View Assignment Details',
        url: `/shows/${data.showId}/judges`
      }
    ],
    url: `/shows/${data.showId}/judges`,
    data: {
      templateKey: 'JUDGE_ASSIGNMENT',
      showId: data.showId,
      judgeId: data.judgeId,
      judgeName: data.judgeName,
      assignedClasses: JSON.stringify(data.assignedClasses),
      detailsUrl: `/shows/${data.showId}/judges`
    }
  })
};

/**
 * Emergency Alert Template
 * Critical alerts requiring immediate attention
 */
export const EMERGENCY_ALERT_TEMPLATE: NotificationTemplate<EmergencyAlertData> = {
  key: 'EMERGENCY_ALERT',
  name: 'Emergency Alert',
  description: 'Critical alerts requiring immediate attention',
  category: 'alert',
  priority: 'critical',
  defaultEnabled: true,
  requiresPermission: true,
  generatePayload: (data: EmergencyAlertData) => ({
    title: getSeverityTitle(data.severity, data.alertType),
    body: data.message,
    icon: '/icons/emergency-alert.png',
    badge: '/icons/app-badge.png',
    tag: `emergency-${data.alertType}-${Date.now()}`,
    requireInteraction: true,
    silent: false,
    timestamp: Date.now(),
    actions: [
      {
        action: 'acknowledge',
        title: 'Acknowledge'
      },
      ...(data.showId ? [{
        action: 'view-details',
        title: 'Show Details',
        url: `/shows/${data.showId}`
      }] : [])
    ],
    url: data.showId ? `/shows/${data.showId}` : '/alerts',
    data: {
      templateKey: 'EMERGENCY_ALERT',
      alertType: data.alertType,
      severity: data.severity,
      message: data.message,
      showId: data.showId || '',
      actionRequired: data.actionRequired?.toString() || 'false',
      expiresAt: data.expiresAt || ''
    }
  })
};

/**
 * Get severity-based title for emergency alerts
 */
function getSeverityTitle(severity: string, alertType: string): string {
  const typeMap: Record<string, string> = {
    weather: 'Weather Alert',
    venue: 'Venue Alert',
    health: 'Health Alert',
    general: 'Important Alert'
  };

  const severityPrefix = severity === 'critical' ? 'URGENT: ' : '';
  return `${severityPrefix}${typeMap[alertType] || 'Alert'}`;
}

/**
 * Template registry for easy access
 */
export const NOTIFICATION_TEMPLATES: Record<NotificationTemplateKey, NotificationTemplate> = {
  SHOW_REMINDER: SHOW_REMINDER_TEMPLATE as NotificationTemplate,
  ENTRY_DEADLINE: ENTRY_DEADLINE_TEMPLATE as NotificationTemplate,
  RESULT_UPDATE: RESULT_UPDATE_TEMPLATE as NotificationTemplate,
  SCHEDULE_CHANGE: SCHEDULE_CHANGE_TEMPLATE as NotificationTemplate,
  JUDGE_ASSIGNMENT: JUDGE_ASSIGNMENT_TEMPLATE as NotificationTemplate,
  EMERGENCY_ALERT: EMERGENCY_ALERT_TEMPLATE as NotificationTemplate,
  // Placeholders for future templates
  PAYMENT_REMINDER: {
    key: 'PAYMENT_REMINDER',
    name: 'Payment Reminder',
    description: 'Reminds about pending payments',
    category: 'reminder',
    priority: 'medium',
    defaultEnabled: true,
    requiresPermission: false,
    generatePayload: (data: unknown) => ({
      title: 'Payment Reminder',
      body: (data && typeof data === 'object' && 'message' in data ? data.message : 'You have a pending payment') as string,
      icon: '/icons/payment-reminder.png',
      badge: '/icons/app-badge.png',
      tag: 'payment-reminder',
      url: '/payments',
      data: { templateKey: 'PAYMENT_REMINDER' }
    })
  },
  ENTRY_CONFIRMATION: {
    key: 'ENTRY_CONFIRMATION',
    name: 'Entry Confirmation',
    description: 'Confirms successful show entries',
    category: 'confirmation',
    priority: 'low',
    defaultEnabled: true,
    requiresPermission: false,
    generatePayload: (data: unknown) => ({
      title: 'Entry Confirmed',
      body: (data && typeof data === 'object' && 'message' in data ? data.message : 'Your show entry has been confirmed') as string,
      icon: '/icons/entry-confirmation.png',
      badge: '/icons/app-badge.png',
      tag: 'entry-confirmation',
      url: '/entries',
      data: { templateKey: 'ENTRY_CONFIRMATION' }
    })
  }
};

/**
 * Notification Template Builder
 * Creates notification payloads from templates and data
 */
export class NotificationTemplateBuilder {
  /**
   * Build notification payload from template
   */
  static buildNotification<T>(
    templateKey: NotificationTemplateKey,
    data: T
  ): NotificationPayload {
    const template = NOTIFICATION_TEMPLATES[templateKey];
    
    if (!template) {
      throw new Error(`Unknown notification template: ${templateKey}`);
    }

    try {
      return template.generatePayload(data);
    } catch (error) {
      logger.error(`Failed to build notification for template ${templateKey}:`, 'notifications', {}, error as Error);
      
      // Return fallback notification
      return {
        title: 'myK9Show Notification',
        body: 'New notification available',
        icon: '/icons/notification-icon.png',
        badge: '/icons/app-badge.png',
        tag: 'fallback',
        url: '/',
        data: { 
          templateKey,
          error: 'template_generation_failed'
        }
      };
    }
  }

  /**
   * Get template metadata
   */
  static getTemplate(templateKey: NotificationTemplateKey): NotificationTemplate {
    return NOTIFICATION_TEMPLATES[templateKey];
  }

  /**
   * Get all available templates
   */
  static getAllTemplates(): NotificationTemplate[] {
    return Object.values(NOTIFICATION_TEMPLATES);
  }

  /**
   * Get templates by category
   */
  static getTemplatesByCategory(category: string): NotificationTemplate[] {
    return Object.values(NOTIFICATION_TEMPLATES).filter(
      template => template.category === category
    );
  }

  /**
   * Get default enabled templates
   */
  static getDefaultEnabledTemplates(): NotificationTemplate[] {
    return Object.values(NOTIFICATION_TEMPLATES).filter(
      template => template.defaultEnabled
    );
  }
}