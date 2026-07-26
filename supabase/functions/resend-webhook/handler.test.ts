import { describe, expect, it, vi } from 'vitest';

import {
  handleResendEmailEvent,
  type EmailLogDeliveryRow,
  type ResendEmailEvent,
  type ResendWebhookDependencies,
} from './handler.ts';

const authLog: EmailLogDeliveryRow = {
  status: 'sent',
  recipient_email: 'new@example.com',
  email_type: 'auth_confirmation',
};

function dependencies(existing: EmailLogDeliveryRow | null = authLog): ResendWebhookDependencies & {
  findEmailLog: ReturnType<typeof vi.fn>;
  updateEmailLog: ReturnType<typeof vi.fn>;
  persistAuthFailureAlert: ReturnType<typeof vi.fn>;
} {
  return {
    findEmailLog: vi.fn().mockResolvedValue({ data: existing, error: null }),
    updateEmailLog: vi.fn().mockResolvedValue({ error: null }),
    persistAuthFailureAlert: vi.fn().mockResolvedValue(undefined),
    now: () => new Date('2026-07-26T20:00:00.000Z'),
    logError: vi.fn(),
  };
}

function event(type: string, data: Partial<ResendEmailEvent['data']> = {}): ResendEmailEvent {
  return {
    type,
    data: {
      email_id: 'email-1',
      ...data,
    },
  };
}

describe('handleResendEmailEvent', () => {
  it('uses Resend’s current bounce payload and alerts the operator', async () => {
    const deps = dependencies();

    await handleResendEmailEvent(
      event('email.bounced', {
        bounce: {
          type: 'Permanent',
          subType: 'NoEmail',
          message: 'Mailbox does not exist',
        },
      }),
      deps
    );

    expect(deps.updateEmailLog).toHaveBeenCalledWith('email-1', {
      status: 'bounced',
      status_updated_at: '2026-07-26T20:00:00.000Z',
      error_message: 'Permanent: Mailbox does not exist',
    });
    expect(deps.persistAuthFailureAlert).toHaveBeenCalledWith({
      emailType: 'auth_confirmation',
      messageId: 'email-1',
      recipientEmail: 'new@example.com',
      status: 'bounced',
      errorMessage: 'Permanent: Mailbox does not exist',
    });
  });

  it.each([
    ['email.complained', {}, 'complained', 'Recipient complaint reported by Resend'],
    [
      'email.failed',
      { failed: { reason: 'reached_daily_quota' } },
      'failed',
      'Resend failed: reached_daily_quota',
    ],
    [
      'email.suppressed',
      {
        suppressed: {
          type: 'OnAccountSuppressionList',
          message: 'Recipient is suppressed',
        },
      },
      'suppressed',
      'OnAccountSuppressionList: Recipient is suppressed',
    ],
  ])('handles %s as a terminal operator-visible failure', async (type, data, status, message) => {
    const deps = dependencies();

    await handleResendEmailEvent(event(type, data), deps);

    expect(deps.updateEmailLog).toHaveBeenCalledWith(
      'email-1',
      expect.objectContaining({
        status,
        error_message: message,
      })
    );
    expect(deps.persistAuthFailureAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        status,
        errorMessage: message,
      })
    );
  });

  it('uses replayed failures to backfill a missing operator alert', async () => {
    const deps = dependencies({ ...authLog, status: 'bounced' });

    await handleResendEmailEvent(
      event('email.bounced', {
        bounce: { type: 'Permanent', message: 'Mailbox does not exist' },
      }),
      deps
    );

    expect(deps.updateEmailLog).not.toHaveBeenCalled();
    expect(deps.persistAuthFailureAlert).toHaveBeenCalledTimes(1);
  });

  it('propagates an alert-write failure so Resend retries the webhook', async () => {
    const deps = dependencies();
    deps.persistAuthFailureAlert.mockRejectedValue(new Error('operator_alerts unavailable'));

    await expect(handleResendEmailEvent(event('email.complained'), deps)).rejects.toThrow(
      'operator_alerts unavailable'
    );
  });

  it('propagates an email-log read failure so Resend retries the webhook', async () => {
    const deps = dependencies();
    deps.findEmailLog.mockResolvedValue({
      data: null,
      error: new Error('email_log unavailable'),
    });

    await expect(handleResendEmailEvent(event('email.failed'), deps)).rejects.toThrow(
      'Failed to read email_log'
    );
  });

  it('retries a recognized event when its email log has not been inserted yet', async () => {
    const deps = dependencies(null);

    await expect(handleResendEmailEvent(event('email.suppressed'), deps)).rejects.toThrow(
      'Email log not found for Resend message email-1'
    );
  });

  it('propagates an email-log update failure so Resend retries the webhook', async () => {
    const deps = dependencies();
    deps.updateEmailLog.mockResolvedValue({ error: new Error('email_log unavailable') });

    await expect(handleResendEmailEvent(event('email.bounced'), deps)).rejects.toThrow(
      'Failed to update email_log'
    );
  });

  it('updates non-auth delivery logs without creating auth alerts', async () => {
    const deps = dependencies({ ...authLog, email_type: 'registration_confirmation' });

    await handleResendEmailEvent(
      event('email.failed', { failed: { reason: 'invalid_recipient' } }),
      deps
    );

    expect(deps.updateEmailLog).toHaveBeenCalled();
    expect(deps.persistAuthFailureAlert).not.toHaveBeenCalled();
  });

  it('does not let a delayed or out-of-order delivered event overwrite a terminal failure', async () => {
    const deps = dependencies({ ...authLog, status: 'bounced' });

    await handleResendEmailEvent(event('email.delivered'), deps);
    await handleResendEmailEvent(event('email.delivery_delayed'), deps);

    expect(deps.updateEmailLog).not.toHaveBeenCalled();
  });

  it('ignores unsupported events without touching the database', async () => {
    const deps = dependencies();

    await handleResendEmailEvent(event('email.opened'), deps);

    expect(deps.findEmailLog).not.toHaveBeenCalled();
  });
});
