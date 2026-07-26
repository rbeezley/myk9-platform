import { describe, expect, it, vi } from 'vitest';

import {
  buildAuthEmailDeliveryFailureAlert,
  buildAuthEmailFailureAlert,
  persistAuthEmailDeliveryFailureAlert,
  persistAuthEmailFailureAlert,
} from './authEmailAlerts.ts';

describe('buildAuthEmailFailureAlert', () => {
  it('creates a deduplicated operator alert without storing the full recipient address', () => {
    expect(
      buildAuthEmailFailureAlert({
        actionType: 'signup',
        recipientEmail: 'alexandra@example.com',
        category: 'rate_limited',
        errorMessage: 'email rate limit exceeded for alexandra@example.com',
      })
    ).toEqual({
      source: 'send-auth-email',
      severity: 'error',
      title: 'Auth signup email rate-limited',
      detail: {
        email_action_type: 'signup',
        failure_category: 'rate_limited',
        recipient_email: 'a***@example.com',
        error: 'email rate limit exceeded for [redacted]',
      },
      dedupe_key: 'auth-email:signup:rate_limited',
    });
  });

  it('bounds an oversized provider error before it reaches the alert board', () => {
    const alert = buildAuthEmailFailureAlert({
      actionType: 'recovery',
      recipientEmail: 'a@example.com',
      category: 'provider_error',
      errorMessage: 'x'.repeat(5000),
    });

    expect(alert.detail.error).toHaveLength(2000);
    expect(alert.detail.error).toMatch(/…$/);
  });

  it('persists the failure on the operator alert board', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ insert }));

    await persistAuthEmailFailureAlert(
      { from },
      {
        actionType: 'signup',
        recipientEmail: 'alexandra@example.com',
        category: 'provider_error',
        errorMessage: 'provider unavailable',
      }
    );

    expect(from).toHaveBeenCalledWith('operator_alerts');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'send-auth-email',
        dedupe_key: 'auth-email:signup:provider_error',
      })
    );
  });

  it('treats an unresolved duplicate alert as an expected dedupe hit', async () => {
    const insert = vi.fn().mockResolvedValue({
      error: { code: '23505', message: 'duplicate key' },
    });

    await expect(
      persistAuthEmailFailureAlert(
        { from: vi.fn(() => ({ insert })) },
        {
          actionType: 'signup',
          recipientEmail: 'alexandra@example.com',
          category: 'rate_limited',
          errorMessage: 'email rate limit exceeded',
        }
      )
    ).resolves.toBeUndefined();
  });
});

describe('auth-email delivery failure alerts', () => {
  it('builds a masked alert for a bounced confirmation email', () => {
    expect(
      buildAuthEmailDeliveryFailureAlert({
        emailType: 'auth_confirmation',
        recipientEmail: 'alexandra@example.com',
        status: 'bounced',
        errorMessage: 'Mailbox rejected alexandra@example.com',
      })
    ).toEqual({
      source: 'resend-webhook',
      severity: 'error',
      title: 'Auth confirmation email bounced',
      detail: {
        email_type: 'auth_confirmation',
        delivery_status: 'bounced',
        recipient_email: 'a***@example.com',
        error: 'Mailbox rejected [redacted]',
      },
      dedupe_key: 'auth-email-delivery:auth_confirmation:bounced',
    });
  });

  it('persists a complaint alert on the operator board', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ insert }));

    await persistAuthEmailDeliveryFailureAlert(
      { from },
      {
        emailType: 'password_reset',
        recipientEmail: 'alexandra@example.com',
        status: 'complained',
        errorMessage: 'Recipient complaint reported by Resend',
      }
    );

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'resend-webhook',
        dedupe_key: 'auth-email-delivery:password_reset:complained',
      })
    );
  });
});
