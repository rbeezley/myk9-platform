import type { AuthEmailDeliveryFailureAlertInput } from '../_shared/authEmailAlerts.ts';

type AuthEmailType = 'auth_confirmation' | 'password_reset';
type DeliveryFailureStatus = 'bounced' | 'complained' | 'failed' | 'suppressed';
type EmailStatus = 'delivered' | 'sent' | DeliveryFailureStatus;

export interface ResendEmailEvent {
  type: string;
  data: {
    email_id: string;
    bounce?: {
      message?: string;
      subType?: string;
      type?: string;
    };
    failed?: {
      reason?: string;
    };
    suppressed?: {
      message?: string;
      type?: string;
    };
    tags?: Record<string, string>;
  };
}

export interface EmailLogDeliveryRow {
  status: string;
  recipient_email: string;
  email_type: string;
}

export interface ResendWebhookDependencies {
  findEmailLog: (
    messageId: string
  ) => Promise<{ data: EmailLogDeliveryRow | null; error: unknown }>;
  updateEmailLog: (
    messageId: string,
    update: {
      status: EmailStatus;
      status_updated_at: string;
      error_message: string | undefined;
    }
  ) => Promise<{ error: unknown }>;
  persistAuthFailureAlert: (input: AuthEmailDeliveryFailureAlertInput) => Promise<void>;
  now?: () => Date;
  logError?: (message: string, error?: unknown) => void;
}

const STATUS_MAP: Record<string, EmailStatus> = {
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.delivery_delayed': 'sent',
  'email.complained': 'complained',
  'email.failed': 'failed',
  'email.suppressed': 'suppressed',
};

const DELIVERY_FAILURE_STATUSES = new Set<EmailStatus>([
  'bounced',
  'complained',
  'failed',
  'suppressed',
]);

export async function handleResendEmailEvent(
  event: ResendEmailEvent,
  dependencies: ResendWebhookDependencies
): Promise<void> {
  const newStatus = STATUS_MAP[event.type];
  if (!newStatus) return;

  const logError = dependencies.logError ?? console.error;
  const { data: existing, error: readError } = await dependencies.findEmailLog(event.data.email_id);
  if (readError) {
    logError('Failed to read email_log', readError);
    throw new Error('Failed to read email_log', { cause: readError });
  }
  if (!existing) {
    if (isTrackedAuthEvent(event)) {
      throw new Error(`Email log not found for tracked auth message ${event.data.email_id}`);
    }
    return;
  }

  const errorMessage = deliveryErrorMessage(event);
  if (shouldUpdateStatus(existing.status, newStatus)) {
    const { error: updateError } = await dependencies.updateEmailLog(event.data.email_id, {
      status: newStatus,
      status_updated_at: (dependencies.now ?? (() => new Date()))().toISOString(),
      error_message: errorMessage,
    });
    if (updateError) {
      logError('Failed to update email_log', updateError);
      throw new Error('Failed to update email_log', { cause: updateError });
    }
  }

  if (isAuthEmailType(existing.email_type) && isDeliveryFailureStatus(newStatus)) {
    await dependencies.persistAuthFailureAlert({
      emailType: existing.email_type,
      messageId: event.data.email_id,
      recipientEmail: existing.recipient_email,
      status: newStatus,
      errorMessage: errorMessage ?? `Auth email ${newStatus}`,
    });
  }
}

function deliveryErrorMessage(event: ResendEmailEvent): string | undefined {
  switch (event.type) {
    case 'email.bounced':
      return `${event.data.bounce?.type ?? 'unknown'}: ${
        event.data.bounce?.message ?? 'No bounce message provided'
      }`;
    case 'email.complained':
      return 'Recipient complaint reported by Resend';
    case 'email.failed':
      return `Resend failed: ${event.data.failed?.reason ?? 'unknown reason'}`;
    case 'email.suppressed':
      return `${event.data.suppressed?.type ?? 'unknown'}: ${
        event.data.suppressed?.message ?? 'No suppression message provided'
      }`;
    default:
      return undefined;
  }
}

function shouldUpdateStatus(existingStatus: string, newStatus: EmailStatus): boolean {
  if (existingStatus === newStatus) return false;
  if (newStatus === 'sent') return false;
  if (DELIVERY_FAILURE_STATUSES.has(existingStatus as EmailStatus) && newStatus === 'delivered') {
    return false;
  }
  return true;
}

function isAuthEmailType(value: string): value is AuthEmailType {
  return value === 'auth_confirmation' || value === 'password_reset';
}

function isDeliveryFailureStatus(value: EmailStatus): value is DeliveryFailureStatus {
  return DELIVERY_FAILURE_STATUSES.has(value);
}

function isTrackedAuthEvent(event: ResendEmailEvent): boolean {
  return isAuthEmailType(event.data.tags?.myk9_email_type ?? '');
}
