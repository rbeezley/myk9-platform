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
  dogName: string;
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
  dogName: string;
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
