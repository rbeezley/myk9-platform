import { sendResendEmailWithRetry, type ResendEmailRequestInit } from '../_shared/resendEmail.ts';
import type {
  AuthEmailActionType,
  AuthEmailFailureAlertInput,
  AuthEmailFailureCategory,
} from '../_shared/authEmailAlerts.ts';

export interface AuthEmailDeliveryInput {
  actionType: AuthEmailActionType;
  recipientEmail: string;
  subject: string;
  html: string;
  fromEmail: string;
  resendApiKey: string | undefined;
}

export interface AuthEmailLogInsert {
  recipient_email: string;
  email_type: 'auth_confirmation' | 'password_reset';
  resend_message_id: string | undefined;
  status: 'sent' | 'failed';
  error_message: string | undefined;
}

export interface AuthEmailDeliveryDependencies {
  sendEmail?: (init: ResendEmailRequestInit) => Promise<Response>;
  writeEmailLog: (record: AuthEmailLogInsert) => Promise<{ error: unknown }>;
  persistFailureAlert: (input: AuthEmailFailureAlertInput) => Promise<void>;
  logError?: (message: string, error?: unknown) => void;
  logInfo?: (message: string) => void;
}

export interface AuthEmailDeliveryOutcome {
  status: 'sent' | 'failed';
  resendMessageId: string | undefined;
  failureCategory: AuthEmailFailureCategory | undefined;
  errorMessage: string | undefined;
}

export async function deliverAuthEmail(
  input: AuthEmailDeliveryInput,
  dependencies: AuthEmailDeliveryDependencies
): Promise<AuthEmailDeliveryOutcome> {
  const sendEmail = dependencies.sendEmail ?? sendResendEmailWithRetry;
  const logError = dependencies.logError ?? console.error;
  const logInfo = dependencies.logInfo ?? console.log;
  let outcome: AuthEmailDeliveryOutcome;

  if (!input.resendApiKey) {
    outcome = failedOutcome('configuration', 'RESEND_API_KEY not configured');
    logError(outcome.errorMessage);
  } else {
    try {
      const response = await sendEmail({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${input.resendApiKey}`,
        },
        body: JSON.stringify({
          from: input.fromEmail,
          to: input.recipientEmail,
          subject: input.subject,
          html: input.html,
        }),
      });

      if (response.ok) {
        const result = (await response.json()) as { id?: unknown };
        if (typeof result.id === 'string' && result.id.length > 0) {
          outcome = {
            status: 'sent',
            resendMessageId: result.id,
            failureCategory: undefined,
            errorMessage: undefined,
          };
          logInfo(`Auth email accepted by Resend: ${result.id}`);
        } else {
          outcome = failedOutcome(
            'provider_error',
            'Resend API returned success without a message id'
          );
        }
      } else {
        const errorBody = await response.text();
        outcome = failedOutcome(
          response.status === 429 ? 'rate_limited' : 'provider_error',
          errorBody || `Resend API returned ${response.status}`
        );
        logError('Resend API error', outcome.errorMessage);
      }
    } catch (error) {
      outcome = failedOutcome(
        'network_error',
        error instanceof Error ? error.message : String(error)
      );
      logError('Resend fetch error', error);
    }
  }

  const { error: logWriteError } = await dependencies.writeEmailLog({
    recipient_email: input.recipientEmail,
    email_type: input.actionType === 'recovery' ? 'password_reset' : 'auth_confirmation',
    resend_message_id: outcome.resendMessageId,
    status: outcome.status,
    error_message: outcome.errorMessage,
  });
  if (logWriteError) {
    logError('Failed to write email_log', logWriteError);
  }

  if (outcome.status === 'failed') {
    try {
      await dependencies.persistFailureAlert({
        actionType: input.actionType,
        recipientEmail: input.recipientEmail,
        category: outcome.failureCategory ?? 'unknown',
        errorMessage: outcome.errorMessage ?? 'Auth email delivery failed',
      });
    } catch (alertError) {
      logError('Failed to write auth email operator alert', alertError);
    }
  }

  return outcome;
}

function failedOutcome(
  failureCategory: AuthEmailFailureCategory,
  errorMessage: string
): AuthEmailDeliveryOutcome {
  return {
    status: 'failed',
    resendMessageId: undefined,
    failureCategory,
    errorMessage,
  };
}
