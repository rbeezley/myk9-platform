export type AuthEmailFailureCategory =
  'configuration' | 'rate_limited' | 'provider_error' | 'network_error' | 'unknown';

export interface AuthEmailFailureAlertInput {
  actionType: 'signup' | 'recovery' | 'magiclink';
  recipientEmail: string;
  category: AuthEmailFailureCategory;
  errorMessage: string;
}

export interface AuthEmailFailureAlert {
  source: 'send-auth-email';
  severity: 'error';
  title: string;
  detail: {
    email_action_type: AuthEmailFailureAlertInput['actionType'];
    failure_category: AuthEmailFailureCategory;
    recipient_email: string;
    error: string;
  };
  dedupe_key: string;
}

interface AuthEmailFailureAlertClient {
  from(table: string): {
    insert(
      value: AuthEmailFailureAlert
    ): PromiseLike<{ error: { code?: string; message?: string } | null }>;
  };
}

const MAX_ERROR_LENGTH = 2000;

export function buildAuthEmailFailureAlert(
  input: AuthEmailFailureAlertInput
): AuthEmailFailureAlert {
  const actionLabel = input.actionType === 'magiclink' ? 'magic link' : input.actionType;
  const title =
    input.category === 'rate_limited'
      ? `Auth ${actionLabel} email rate-limited`
      : `Auth ${actionLabel} email delivery failed`;

  return {
    source: 'send-auth-email',
    severity: 'error',
    title,
    detail: {
      email_action_type: input.actionType,
      failure_category: input.category,
      recipient_email: maskEmail(input.recipientEmail),
      error: truncate(redactEmails(input.errorMessage)),
    },
    dedupe_key: `auth-email:${input.actionType}:${input.category}`,
  };
}

export async function persistAuthEmailFailureAlert(
  client: AuthEmailFailureAlertClient,
  input: AuthEmailFailureAlertInput
): Promise<void> {
  const { error } = await client.from('operator_alerts').insert(buildAuthEmailFailureAlert(input));
  if (error && error.code !== '23505') {
    throw new Error(error.message ?? 'operator_alerts insert failed');
  }
}

function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0 || atIndex === email.length - 1) return '[redacted]';
  return `${email[0]}***${email.slice(atIndex)}`;
}

function truncate(value: string): string {
  if (value.length <= MAX_ERROR_LENGTH) return value;
  return `${value.slice(0, MAX_ERROR_LENGTH - 1)}…`;
}

function redactEmails(value: string): string {
  return value.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted]');
}
