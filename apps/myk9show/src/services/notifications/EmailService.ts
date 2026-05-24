/**
 * Email Notification Service
 * Handles email notifications for dog show management system
 */

import { logger } from '@/services/LoggingService';
import { supabase } from '@/lib/supabase';
import {
  replaceVariables,
  htmlToText,
  createDefaultTemplates,
  normalizeShowReminderData,
} from './EmailService.helpers';
import type {
  EmailTemplate,
  EmailNotification,
  EntryConfirmationData,
  ShowReminderData,
  ResultsData,
} from './EmailService.types';

// Re-export all types for external consumers
export type {
  EmailTemplate,
  EmailNotification,
  EntryConfirmationData,
  EntryTemplateVariables,
  ShowReminderData,
  ResultsData,
} from './EmailService.types';

export class EmailService {
  private static instance: EmailService;
  private templates: Map<string, EmailTemplate> = new Map();

  private constructor() {
    this.templates = createDefaultTemplates();
  }

  static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  /**
   * Send entry confirmation email
   */
  async sendEntryConfirmation(email: string, data: EntryConfirmationData): Promise<boolean> {
    const template = this.templates.get('entry_confirmation');
    if (!template) {
      logger.error('Entry confirmation template not found', 'notifications');
      return false;
    }

    const notification: Omit<EmailNotification, 'id'> = {
      to: email,
      subject: replaceVariables(template.subject, data),
      htmlContent: replaceVariables(template.htmlContent, data),
      textContent: replaceVariables(template.textContent, data),
      templateId: template.id,
      variables: {
        ...data,
        entryFee: data.entryFee?.toString() || '0',
      } as Record<string, string>,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return this.sendNotification(notification);
  }

  /**
   * Send show reminder email
   */
  async sendShowReminder(email: string, data: ShowReminderData): Promise<boolean> {
    const template = this.templates.get('show_reminder');
    if (!template) {
      logger.error('Show reminder template not found', 'notifications');
      return false;
    }
    const variables = normalizeShowReminderData(data);

    const notification: Omit<EmailNotification, 'id'> = {
      to: email,
      subject: replaceVariables(template.subject, variables),
      htmlContent: replaceVariables(template.htmlContent, variables),
      textContent: replaceVariables(template.textContent, variables),
      templateId: template.id,
      variables: variables as Record<string, string>,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return this.sendNotification(notification);
  }

  /**
   * Send results notification email
   */
  async sendResultsNotification(email: string, data: ResultsData): Promise<boolean> {
    const template = this.templates.get('results_notification');
    if (!template) {
      logger.error('Results notification template not found', 'notifications');
      return false;
    }

    const notification: Omit<EmailNotification, 'id'> = {
      to: email,
      subject: replaceVariables(template.subject, data),
      htmlContent: replaceVariables(template.htmlContent, data),
      textContent: replaceVariables(template.textContent, data),
      templateId: template.id,
      variables: data as Record<string, string>,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return this.sendNotification(notification);
  }

  /**
   * Send custom email notification
   */
  async sendCustomNotification(
    to: string,
    subject: string,
    htmlContent: string,
    textContent?: string
  ): Promise<boolean> {
    const notification: Omit<EmailNotification, 'id'> = {
      to,
      subject,
      htmlContent,
      textContent: textContent || htmlToText(htmlContent),
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return this.sendNotification(notification);
  }

  /**
   * Schedule email notification for later
   */
  async scheduleNotification(
    notification: Omit<EmailNotification, 'id'>,
    scheduledFor: Date
  ): Promise<boolean> {
    try {
      const { error } = await supabase.from('notification_queue').insert({
        notification_type: 'email',
        title: notification.subject,
        body: notification.textContent || notification.htmlContent.substring(0, 500),
        channels: ['email'],
        status: 'pending',
        scheduled_for: scheduledFor.toISOString(),
        data: {
          to: notification.to,
          cc: notification.cc,
          bcc: notification.bcc,
          subject: notification.subject,
          htmlContent: notification.htmlContent,
          textContent: notification.textContent,
          templateId: notification.templateId,
          variables: notification.variables,
        },
      });

      if (error) {
        logger.error(
          'Failed to insert scheduled notification into queue',
          'notifications',
          { error: error.message },
          error as unknown as Error
        );
        return false;
      }

      logger.info('Scheduled email notification', 'notifications', {
        to: notification.to,
        subject: notification.subject,
        scheduledFor: scheduledFor.toISOString(),
      });

      return true;
    } catch (error) {
      logger.error('Failed to schedule email notification', 'notifications', {}, error as Error);
      return false;
    }
  }

  /**
   * Process scheduled notifications (to be called by cron job or scheduler)
   */
  async processScheduledNotifications(): Promise<number> {
    try {
      const { data, error } = await supabase
        .from('notification_queue')
        .select('*')
        .eq('status', 'pending')
        .contains('channels', ['email'])
        .lte('scheduled_for', new Date().toISOString())
        .order('scheduled_for', { ascending: true })
        .limit(50);

      if (error) {
        logger.error(
          'Failed to query scheduled notifications',
          'notifications',
          { error: error.message },
          error as unknown as Error
        );
        return 0;
      }

      if (!data || data.length === 0) {
        return 0;
      }

      let processedCount = 0;
      for (const item of data) {
        const emailData = item.data as Record<string, unknown> | null;
        if (!emailData?.to) continue;

        const notification: Omit<EmailNotification, 'id'> = {
          to: emailData.to as string,
          subject: (emailData.subject as string) || item.title,
          htmlContent: (emailData.htmlContent as string) || item.body || '',
          textContent: (emailData.textContent as string) || '',
          status: 'pending',
          createdAt: item.created_at ? new Date(item.created_at) : new Date(),
          updatedAt: new Date(),
        };
        if (emailData.cc) notification.cc = emailData.cc as string[];
        if (emailData.bcc) notification.bcc = emailData.bcc as string[];
        if (emailData.templateId) notification.templateId = emailData.templateId as string;
        if (emailData.variables)
          notification.variables = emailData.variables as Record<string, string>;

        const sent = await this.sendNotification(notification);

        await supabase
          .from('notification_queue')
          .update({
            status: sent ? 'sent' : 'failed',
            sent_at: sent ? new Date().toISOString() : null,
            error_message: sent ? null : 'Send failed',
          })
          .eq('id', item.id);

        if (sent) processedCount++;
      }

      logger.info('Processed scheduled notifications', 'notifications', {
        processedCount,
        total: data.length,
      });
      return processedCount;
    } catch (error) {
      logger.error(
        'Failed to process scheduled notifications',
        'notifications',
        {},
        error as Error
      );
      return 0;
    }
  }

  /**
   * Send email notification (implementation depends on email provider)
   */
  private async sendNotification(
    notification: Omit<EmailNotification, 'id'> | EmailNotification
  ): Promise<boolean> {
    try {
      logger.info('Email Notification', 'notifications', {
        to: notification.to,
        subject: notification.subject,
        preview: notification.htmlContent.substring(0, 200) + '...',
      });

      // Track in notification_queue
      const { error: queueError } = await supabase.from('notification_queue').insert({
        notification_type: 'email',
        title: notification.subject,
        body: notification.textContent || notification.htmlContent.substring(0, 500),
        channels: ['email'],
        status: 'sent',
        sent_at: new Date().toISOString(),
        data: {
          to: notification.to,
          cc: notification.cc,
          bcc: notification.bcc,
          subject: notification.subject,
          templateId: notification.templateId,
          variables: notification.variables,
        },
      });

      if (queueError) {
        // Non-fatal: log but don't fail the notification
        logger.warn('Failed to track email in notification_queue', 'notifications', {
          error: queueError.message,
        });
      }

      // In production, send via Edge Function:
      // const { error } = await supabase.functions.invoke('send-email', {
      //   body: { to: notification.to, subject: notification.subject, html: notification.htmlContent, text: notification.textContent }
      // });

      return true;
    } catch (error) {
      logger.error('Failed to send email notification', 'notifications', {}, error as Error);
      return false;
    }
  }

  /**
   * Get email notification history
   */
  async getNotificationHistory(limit: number = 50): Promise<EmailNotification[]> {
    try {
      const { data, error } = await supabase
        .from('notification_queue')
        .select('*')
        .contains('channels', ['email'])
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error(
          'Failed to query notification history',
          'notifications',
          { error: error.message },
          error as unknown as Error
        );
        return [];
      }

      return (data ?? []).map(item => {
        const emailData = item.data as Record<string, unknown> | null;

        const status: EmailNotification['status'] =
          item.status === 'sent'
            ? 'sent'
            : item.status === 'failed'
              ? 'failed'
              : item.scheduled_for && new Date(item.scheduled_for) > new Date()
                ? 'scheduled'
                : 'pending';

        const result: EmailNotification = {
          id: item.id,
          to: (emailData?.to as string) || '',
          subject: (emailData?.subject as string) || item.title,
          htmlContent: (emailData?.htmlContent as string) || '',
          textContent: (emailData?.textContent as string) || item.body || '',
          status,
          createdAt: item.created_at ? new Date(item.created_at) : new Date(),
          updatedAt: item.created_at ? new Date(item.created_at) : new Date(),
        };

        if (emailData?.cc) result.cc = emailData.cc as string[];
        if (emailData?.bcc) result.bcc = emailData.bcc as string[];
        if (emailData?.templateId) result.templateId = emailData.templateId as string;
        if (emailData?.variables) result.variables = emailData.variables as Record<string, string>;
        if (item.sent_at) result.sentAt = new Date(item.sent_at);
        if (item.scheduled_for) result.scheduledFor = new Date(item.scheduled_for);
        if (item.error_message) result.errorMessage = item.error_message;

        return result;
      });
    } catch (error) {
      logger.error('Failed to fetch notification history', 'notifications', {}, error as Error);
      return [];
    }
  }

  /**
   * Get email templates
   */
  getTemplates(): EmailTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get specific email template
   */
  getTemplate(templateId: string): EmailTemplate | undefined {
    return this.templates.get(templateId);
  }

  /**
   * Test email service with sample data
   */
  async testEmailService(): Promise<boolean> {
    const testData: EntryConfirmationData = {
      ownerName: 'John Smith',
      dogName: 'Champion Rex',
      showName: 'Summer Classic Dog Show',
      showDate: 'July 20, 2024',
      className: 'Open Adult Male',
      entryNumber: 'SC2024-0042',
      confirmationCode: 'ABC123XYZ',
      venue: 'Fairgrounds Expo Center',
      judgeName: 'Dr. Sarah Johnson',
      entryFee: 35.0,
    };

    return await this.sendEntryConfirmation('test@example.com', testData);
  }
}

// Export singleton instance
export const emailService = EmailService.getInstance();
