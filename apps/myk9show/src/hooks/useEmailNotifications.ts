/**
 * Hook for managing email notifications in the dog show management system
 */

import { useState, useCallback } from 'react';
import { 
  emailService, 
  EntryConfirmationData, 
  ShowReminderData, 
  ResultsData,
  EmailNotification 
} from '@/services/notifications/EmailService';
import type { Entry } from '@/types/entry-refactored-types';

// Extended Entry interface with computed/denormalized properties for email notifications
interface EntryForEmail extends Entry {
  // Computed properties from related tables
  ownerName?: string;
  ownerEmail?: string;
  dogName?: string;
  showName?: string;
  showDate?: string;
  className?: string;
  entryNumber?: string;
  confirmationCode?: string;
  venue?: string;
  judgeName?: string;
  entryFee?: number;
  ringNumber?: string;
  placement?: number; // For results
  points?: number;    // Points earned
  award?: string;     // Award received
}

interface EntryWithOwner extends EntryForEmail {
  owner?: { name: string; email?: string };
}

interface ResultWithOwner extends EntryForEmail {
  ownerEmail?: string;
  entry?: { ownerName?: string; dogName?: string; className?: string; ownerEmail?: string; };
}

interface GroupedOwnerData {
  ownerName: string;
  entries?: Array<{
    dogName: string;
    className: string;
    ringNumber?: string;
  }>;
  results?: Array<{
    dogName: string;
    className: string;
    placement?: number;
    points?: number;
    award?: string;
  }>;
}

interface EmailStatus {
  loading: boolean;
  error: string | null;
  success: boolean;
}

export function useEmailNotifications() {
  const [status, setStatus] = useState<EmailStatus>({
    loading: false,
    error: null,
    success: false
  });

  const [history, setHistory] = useState<EmailNotification[]>([]);

  /**
   * Send entry confirmation email
   */
  const sendEntryConfirmation = useCallback(async (
    email: string, 
    data: EntryConfirmationData
  ): Promise<boolean> => {
    setStatus({ loading: true, error: null, success: false });
    
    try {
      const success = await emailService.sendEntryConfirmation(email, data);
      setStatus({ loading: false, error: null, success });
      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send email';
      setStatus({ loading: false, error: errorMessage, success: false });
      return false;
    }
  }, []);

  /**
   * Send show reminder email
   */
  const sendShowReminder = useCallback(async (
    email: string, 
    data: ShowReminderData
  ): Promise<boolean> => {
    setStatus({ loading: true, error: null, success: false });
    
    try {
      const success = await emailService.sendShowReminder(email, data);
      setStatus({ loading: false, error: null, success });
      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send email';
      setStatus({ loading: false, error: errorMessage, success: false });
      return false;
    }
  }, []);

  /**
   * Send results notification email
   */
  const sendResultsNotification = useCallback(async (
    email: string, 
    data: ResultsData
  ): Promise<boolean> => {
    setStatus({ loading: true, error: null, success: false });
    
    try {
      const success = await emailService.sendResultsNotification(email, data);
      setStatus({ loading: false, error: null, success });
      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send email';
      setStatus({ loading: false, error: errorMessage, success: false });
      return false;
    }
  }, []);

  /**
   * Send custom email
   */
  const sendCustomEmail = useCallback(async (
    to: string,
    subject: string,
    htmlContent: string,
    textContent?: string
  ): Promise<boolean> => {
    setStatus({ loading: true, error: null, success: false });
    
    try {
      const success = await emailService.sendCustomNotification(to, subject, htmlContent, textContent);
      setStatus({ loading: false, error: null, success });
      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send email';
      setStatus({ loading: false, error: errorMessage, success: false });
      return false;
    }
  }, []);

  /**
   * Send bulk emails to multiple recipients
   */
  const sendBulkEmails = useCallback(async (
    emails: string[],
    emailType: 'entry_confirmation' | 'show_reminder' | 'results',
    data: EntryConfirmationData | ShowReminderData | ResultsData
  ): Promise<{ successful: number; failed: number }> => {
    setStatus({ loading: true, error: null, success: false });
    
    let successful = 0;
    let failed = 0;
    
    try {
      for (const email of emails) {
        let success = false;
        
        switch (emailType) {
          case 'entry_confirmation':
            success = await emailService.sendEntryConfirmation(email, data as EntryConfirmationData);
            break;
          case 'show_reminder':
            success = await emailService.sendShowReminder(email, data as ShowReminderData);
            break;
          case 'results':
            success = await emailService.sendResultsNotification(email, data as ResultsData);
            break;
        }
        
        if (success) {
          successful++;
        } else {
          failed++;
        }
        
        // Small delay to avoid overwhelming email service
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      const allSuccessful = failed === 0;
      setStatus({ loading: false, error: null, success: allSuccessful });
      return { successful, failed };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send bulk emails';
      setStatus({ loading: false, error: errorMessage, success: false });
      return { successful, failed: emails.length };
    }
  }, []);

  /**
   * Load email notification history
   */
  const loadHistory = useCallback(async (limit: number = 50): Promise<void> => {
    try {
      const notifications = await emailService.getNotificationHistory(limit);
      setHistory(notifications);
    } catch {
      setStatus(prev => ({
        ...prev,
        error: 'Failed to load email history'
      }));
    }
  }, []);

  /**
   * Test email service
   */
  const testEmailService = useCallback(async (): Promise<boolean> => {
    setStatus({ loading: true, error: null, success: false });
    
    try {
      const success = await emailService.testEmailService();
      setStatus({ loading: false, error: null, success });
      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Email service test failed';
      setStatus({ loading: false, error: errorMessage, success: false });
      return false;
    }
  }, []);

  /**
   * Clear status
   */
  const clearStatus = useCallback(() => {
    setStatus({ loading: false, error: null, success: false });
  }, []);

  /**
   * Get available email templates
   */
  const getTemplates = useCallback(() => {
    return emailService.getTemplates();
  }, []);

  return {
    // Status
    loading: status.loading,
    error: status.error,
    success: status.success,
    history,

    // Actions
    sendEntryConfirmation,
    sendShowReminder,
    sendResultsNotification,
    sendCustomEmail,
    sendBulkEmails,
    loadHistory,
    testEmailService,
    clearStatus,
    getTemplates,
  };
}

/**
 * Hook for email notification automation
 * Automatically sends emails based on show events
 */
export function useEmailAutomation() {
  const { sendEntryConfirmation, sendShowReminder, sendResultsNotification } = useEmailNotifications();

  /**
   * Automatically send entry confirmation when entry is created
   */
  const onEntryCreated = useCallback(async (entry: EntryForEmail, ownerEmail: string) => {
    if (!entry || !ownerEmail) return false;

    const confirmationData: EntryConfirmationData = {
      ownerName: entry.ownerName || 'Exhibitor',
      dogName: entry.dogName || 'Dog',
      showName: entry.showName || 'Dog Show',
      showDate: entry.showDate ? new Date(entry.showDate).toLocaleDateString() : 'TBD',
      className: entry.className || 'Open',
      entryNumber: entry.entryNumber || entry.id || 'N/A',
      confirmationCode: entry.confirmationCode || entry.id || 'N/A',
      venue: entry.venue || 'TBD',
      judgeName: entry.judgeName,
      entryFee: entry.entryFee || 0
    };

    return await sendEntryConfirmation(ownerEmail, confirmationData);
  }, [sendEntryConfirmation]);

  /**
   * Automatically send show reminders 24 hours before show
   */
  const scheduleShowReminders = useCallback(async (show: Record<string, unknown>, entries: EntryWithOwner[]) => {
    if (!show || !entries.length) return 0;

    let sentCount = 0;
    
    // Group entries by owner email
    const entriesByOwner = entries.reduce((acc, entry) => {
      const email = entry.ownerEmail || entry.owner?.email;
      if (email) {
        if (!acc[email]) {
          acc[email] = {
            ownerName: entry.ownerName || entry.owner?.name || 'Exhibitor',
            entries: []
          };
        }
        acc[email]?.entries?.push({
          dogName: entry.dogName || 'Dog',
          className: entry.className || 'Open',
          ringNumber: entry.ringNumber
        });
      }
      return acc;
    }, {} as Record<string, GroupedOwnerData>);

    // Send reminder to each owner
    for (const [email, ownerData] of Object.entries(entriesByOwner)) {
      const reminderData: ShowReminderData = {
        ownerName: ownerData.ownerName,
        dogName: ownerData.entries?.[0]?.dogName || 'Dog', // Use first entry's dog name as default
        showName: (show.name as string) || 'Dog Show',
        showDate: show.date ? new Date(show.date as string).toLocaleDateString() : 'TBD',
        venue: (show.venue as string) || 'TBD',
        address: (show.address as string) || 'TBD',
        checkInTime: (show.checkInTime as string) || '8:00 AM',
        judgingTime: show.judgingTime as string,
        entries: ownerData.entries || []
      };

      const success = await sendShowReminder(email, reminderData);
      if (success) {
        sentCount++;
      }
    }

    return sentCount;
  }, [sendShowReminder]);

  /**
   * Automatically send results when judging is complete
   */
  const onJudgingComplete = useCallback(async (show: Record<string, unknown>, results: ResultWithOwner[]) => {
    if (!show || !results.length) return 0;

    let sentCount = 0;
    
    // Group results by owner email
    const resultsByOwner = results.reduce((acc, result) => {
      const email = result.ownerEmail || result.entry?.ownerEmail;
      if (email) {
        if (!acc[email]) {
          acc[email] = {
            ownerName: result.ownerName || result.entry?.ownerName || 'Exhibitor',
            results: []
          };
        }
        acc[email]?.results?.push({
          dogName: result.dogName || result.entry?.dogName || 'Dog',
          className: result.className || result.entry?.className || 'Open',
          placement: result.placement,
          points: result.points,
          award: result.award
        });
      }
      return acc;
    }, {} as Record<string, GroupedOwnerData>);

    // Send results to each owner
    for (const [email, ownerData] of Object.entries(resultsByOwner)) {
      const resultsData: ResultsData = {
        ownerName: ownerData.ownerName,
        dogName: ownerData.results?.[0]?.dogName || 'Dog', // Use first result's dog name as default
        showName: (show.name as string) || 'Dog Show',
        showDate: show.date ? new Date(show.date as string).toLocaleDateString() : 'TBD',
        results: ownerData.results || []
      };

      const success = await sendResultsNotification(email, resultsData);
      if (success) {
        sentCount++;
      }
    }

    return sentCount;
  }, [sendResultsNotification]);

  return {
    onEntryCreated,
    scheduleShowReminders,
    onJudgingComplete,
  };
}