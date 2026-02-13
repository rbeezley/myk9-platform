/**
 * Email Notification Service
 * Handles email notifications for dog show management system
 */

import { logger } from '@/services/LoggingService';
import { supabase } from '@/lib/supabase';

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  variables: string[];
}

export interface EmailNotification {
  id?: string;
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  htmlContent: string;
  textContent: string;
  templateId?: string;
  variables?: Record<string, string>;
  scheduledFor?: Date;
  sentAt?: Date;
  status: 'pending' | 'sent' | 'failed' | 'scheduled';
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EntryConfirmationData {
  ownerName: string;
  dogName: string;
  showName: string;
  showDate: string;
  className: string;
  entryNumber: string;
  confirmationCode: string;
  venue: string;
  judgeName?: string;
  entryFee: number;
  [key: string]: string | number | Array<Record<string, string | number>> | undefined;
}

// Template variable types for different email contexts
export interface EntryTemplateVariables {
  ownerName: string;
  dogName: string;
  showName: string;
  className?: string;
  entryFee?: number;
  entries?: Array<Record<string, string | number>>;
  results?: Array<Record<string, string | number>>;
  [key: string]: string | number | Array<Record<string, string | number>> | undefined;
}

export interface ShowReminderData {
  ownerName: string;
  dogName: string; // Add missing required property
  showName: string;
  showDate: string;
  venue: string;
  address: string;
  checkInTime: string;
  judgingTime?: string;
  entries: Array<{
    dogName: string;
    className: string;
    ringNumber?: string;
  }>;
  [key: string]: string | number | Array<Record<string, string | number>> | undefined;
}

export interface ResultsData {
  ownerName: string;
  dogName: string; // Add missing required property
  showName: string;
  showDate: string;
  results: Array<{
    dogName: string;
    className: string;
    placement?: number;
    points?: number;
    award?: string;
  }>;
  [key: string]: string | number | Array<Record<string, string | number>> | undefined;
}

export class EmailService {
  private static instance: EmailService;
  private templates: Map<string, EmailTemplate> = new Map();

  private constructor() {
    this.initializeTemplates();
  }

  static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  /**
   * Initialize default email templates
   */
  private initializeTemplates(): void {
    // Entry Confirmation Template
    this.templates.set('entry_confirmation', {
      id: 'entry_confirmation',
      name: 'Entry Confirmation',
      subject: 'Entry Confirmation - {{showName}}',
      variables: ['ownerName', 'dogName', 'showName', 'showDate', 'className', 'entryNumber', 'confirmationCode', 'venue', 'entryFee'],
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Entry Confirmation</h2>
          
          <p>Dear {{ownerName}},</p>
          
          <p>Your entry has been successfully confirmed for the following show:</p>
          
          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1e40af;">Show Details</h3>
            <p><strong>Show Name:</strong> {{showName}}</p>
            <p><strong>Date:</strong> {{showDate}}</p>
            <p><strong>Venue:</strong> {{venue}}</p>
          </div>
          
          <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1e40af;">Entry Information</h3>
            <p><strong>Dog Name:</strong> {{dogName}}</p>
            <p><strong>Class:</strong> {{className}}</p>
            <p><strong>Entry Number:</strong> {{entryNumber}}</p>
            <p><strong>Confirmation Code:</strong> <code style="background-color: #dbeafe; padding: 2px 6px; border-radius: 4px;">{{confirmationCode}}</code></p>
            <p><strong>Entry Fee:</strong> $` + '{{entryFee}}' + `</p>
          </div>
          
          <p><strong>Important:</strong> Please bring this confirmation and your dog's registration papers to the show.</p>
          
          <p>Thank you for entering our show!</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #6b7280;">This email was sent by myK9Show. Please do not reply to this email.</p>
        </div>
      `,
      textContent: `
Entry Confirmation

Dear {{ownerName}},

Your entry has been successfully confirmed for the following show:

Show Details:
- Show Name: {{showName}}
- Date: {{showDate}}
- Venue: {{venue}}

Entry Information:
- Dog Name: {{dogName}}
- Class: {{className}}
- Entry Number: {{entryNumber}}
- Confirmation Code: {{confirmationCode}}
- Entry Fee: $` + '{{entryFee}}' + `

Important: Please bring this confirmation and your dog's registration papers to the show.

Thank you for entering our show!

---
This email was sent by myK9Show. Please do not reply to this email.
      `
    });

    // Show Reminder Template
    this.templates.set('show_reminder', {
      id: 'show_reminder',
      name: 'Show Reminder',
      subject: 'Show Reminder - {{showName}} Tomorrow',
      variables: ['ownerName', 'showName', 'showDate', 'venue', 'address', 'checkInTime', 'judgingTime', 'entries'],
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">Show Reminder</h2>
          
          <p>Dear {{ownerName}},</p>
          
          <p>This is a friendly reminder that you have entries in tomorrow's dog show:</p>
          
          <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
            <h3 style="margin-top: 0; color: #991b1b;">{{showName}}</h3>
            <p><strong>Date:</strong> {{showDate}}</p>
            <p><strong>Venue:</strong> {{venue}}</p>
            <p><strong>Address:</strong> {{address}}</p>
            <p><strong>Check-in Time:</strong> {{checkInTime}}</p>
            {{#if judgingTime}}<p><strong>Judging Starts:</strong> {{judgingTime}}</p>{{/if}}
          </div>
          
          <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #374151;">Your Entries</h3>
            {{#each entries}}
            <div style="margin-bottom: 10px;">
              <p><strong>{{dogName}}</strong> in {{className}}{{#if ringNumber}} (Ring {{ringNumber}}){{/if}}</p>
            </div>
            {{/each}}
          </div>
          
          <div style="background-color: #fffbeb; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h4 style="margin-top: 0; color: #92400e;">Checklist:</h4>
            <ul style="color: #92400e;">
              <li>Registration papers</li>
              <li>Vaccination records (if required)</li>
              <li>Grooming supplies</li>
              <li>Food and water for your dog</li>
              <li>This confirmation email</li>
            </ul>
          </div>
          
          <p>Good luck at the show!</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #6b7280;">This email was sent by myK9Show. Please do not reply to this email.</p>
        </div>
      `,
      textContent: `
Show Reminder

Dear {{ownerName}},

This is a friendly reminder that you have entries in tomorrow's dog show:

{{showName}}
Date: {{showDate}}
Venue: {{venue}}
Address: {{address}}
Check-in Time: {{checkInTime}}
{{#if judgingTime}}Judging Starts: {{judgingTime}}{{/if}}

Your Entries:
{{#each entries}}
- {{dogName}} in {{className}}{{#if ringNumber}} (Ring {{ringNumber}}){{/if}}
{{/each}}

Checklist:
- Registration papers
- Vaccination records (if required)
- Grooming supplies
- Food and water for your dog
- This confirmation email

Good luck at the show!

---
This email was sent by myK9Show. Please do not reply to this email.
      `
    });

    // Results Template
    this.templates.set('results_notification', {
      id: 'results_notification',
      name: 'Results Notification',
      subject: 'Show Results - {{showName}}',
      variables: ['ownerName', 'showName', 'showDate', 'results'],
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #059669;">Show Results</h2>
          
          <p>Dear {{ownerName}},</p>
          
          <p>The results from {{showName}} are now available:</p>
          
          <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #047857;">{{showName}} - {{showDate}}</h3>
            
            {{#each results}}
            <div style="background-color: white; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 4px solid #10b981;">
              <h4 style="margin-top: 0; color: #065f46;">{{dogName}} - {{className}}</h4>
              {{#if placement}}
                <p><strong>Placement:</strong> {{placement}}{{#if points}} ({{points}} points){{/if}}</p>
              {{else}}
                <p>No placement awarded</p>
              {{/if}}
              {{#if award}}
                <p style="color: #059669;"><strong>Special Award:</strong> {{award}}</p>
              {{/if}}
            </div>
            {{/each}}
          </div>
          
          <p>Congratulations on participating in the show!</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #6b7280;">This email was sent by myK9Show. Please do not reply to this email.</p>
        </div>
      `,
      textContent: `
Show Results

Dear {{ownerName}},

The results from {{showName}} are now available:

{{showName}} - {{showDate}}

{{#each results}}
{{dogName}} - {{className}}
{{#if placement}}
Placement: {{placement}}{{#if points}} ({{points}} points){{/if}}
{{else}}
No placement awarded
{{/if}}
{{#if award}}
Special Award: {{award}}
{{/if}}

{{/each}}

Congratulations on participating in the show!

---
This email was sent by myK9Show. Please do not reply to this email.
      `
    });
  }

  /**
   * Replace template variables with actual values
   */
  private replaceVariables(content: string, variables: EntryTemplateVariables): string {
    let result = content;
    
    // Replace simple variables
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, String(value || ''));
    }
    
    // Handle each loops (basic implementation)
    if (variables.entries && Array.isArray(variables.entries)) {
      const eachRegex = /{{#each entries}}(.*?){{\/each}}/gs;
      result = result.replace(eachRegex, (_match, content) => {
        return variables.entries!.map((entry: Record<string, string | number>) => {
          let entryContent = content;
          for (const [key, value] of Object.entries(entry)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            entryContent = entryContent.replace(regex, String(value || ''));
          }
          return entryContent;
        }).join('');
      });
    }
    
    if (variables.results && Array.isArray(variables.results)) {
      const eachRegex = /{{#each results}}(.*?){{\/each}}/gs;
      result = result.replace(eachRegex, (_match, content) => {
        return variables.results!.map((result: Record<string, string | number>) => {
          let resultContent = content;
          for (const [key, value] of Object.entries(result)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            resultContent = resultContent.replace(regex, String(value || ''));
          }
          return resultContent;
        }).join('');
      });
    }
    
    // Handle conditional blocks (basic implementation)
    const ifRegex = /{{#if (\w+)}}(.*?){{\/if}}/gs;
    result = result.replace(ifRegex, (_match, condition, content) => {
      return variables[condition] ? content : '';
    });
    
    return result;
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
      subject: this.replaceVariables(template.subject, data),
      htmlContent: this.replaceVariables(template.htmlContent, data),
      textContent: this.replaceVariables(template.textContent, data),
      templateId: template.id,
      variables: {
        ...data,
        entryFee: data.entryFee?.toString() || '0'
      } as Record<string, string>,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
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

    const notification: Omit<EmailNotification, 'id'> = {
      to: email,
      subject: this.replaceVariables(template.subject, data),
      htmlContent: this.replaceVariables(template.htmlContent, data),
      textContent: this.replaceVariables(template.textContent, data),
      templateId: template.id,
      variables: data as Record<string, string>,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
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
      subject: this.replaceVariables(template.subject, data),
      htmlContent: this.replaceVariables(template.htmlContent, data),
      textContent: this.replaceVariables(template.textContent, data),
      templateId: template.id,
      variables: data as Record<string, string>,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
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
      textContent: textContent || this.htmlToText(htmlContent),
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
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
      const { error } = await supabase
        .from('notification_queue')
        .insert({
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
        logger.error('Failed to insert scheduled notification into queue', 'notifications', { error: error.message }, error as unknown as Error);
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
        logger.error('Failed to query scheduled notifications', 'notifications', { error: error.message }, error as unknown as Error);
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
        if (emailData.variables) notification.variables = emailData.variables as Record<string, string>;

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

      logger.info('Processed scheduled notifications', 'notifications', { processedCount, total: data.length });
      return processedCount;
    } catch (error) {
      logger.error('Failed to process scheduled notifications', 'notifications', {}, error as Error);
      return 0;
    }
  }

  /**
   * Send email notification (implementation depends on email provider)
   */
  private async sendNotification(notification: Omit<EmailNotification, 'id'> | EmailNotification): Promise<boolean> {
    try {
      logger.info('Email Notification', 'notifications', {
        to: notification.to,
        subject: notification.subject,
        preview: notification.htmlContent.substring(0, 200) + '...'
      });

      // Track in notification_queue
      const { error: queueError } = await supabase
        .from('notification_queue')
        .insert({
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
        logger.warn('Failed to track email in notification_queue', 'notifications', { error: queueError.message });
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
   * Convert HTML content to plain text
   */
  private htmlToText(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
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
        logger.error('Failed to query notification history', 'notifications', { error: error.message }, error as unknown as Error);
        return [];
      }

      return (data ?? []).map((item) => {
        const emailData = item.data as Record<string, unknown> | null;

        const status: EmailNotification['status'] =
          item.status === 'sent' ? 'sent'
          : item.status === 'failed' ? 'failed'
          : item.scheduled_for && new Date(item.scheduled_for) > new Date() ? 'scheduled'
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
      entryFee: 35.00
    };

    return await this.sendEntryConfirmation('test@example.com', testData);
  }
}

// Export singleton instance
export const emailService = EmailService.getInstance();