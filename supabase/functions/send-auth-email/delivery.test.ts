import { describe, expect, it, vi } from 'vitest';

import {
  deliverAuthEmail,
  type AuthEmailDeliveryDependencies,
  type AuthEmailDeliveryInput,
} from './delivery.ts';

const input: AuthEmailDeliveryInput = {
  actionType: 'signup',
  recipientEmail: 'new@example.com',
  subject: 'Confirm your email',
  html: '<p>Confirm</p>',
  fromEmail: 'myK9Show <notifications@myk9show.com>',
  resendApiKey: 're_test',
};

function dependencies(
  sendEmail: AuthEmailDeliveryDependencies['sendEmail']
): AuthEmailDeliveryDependencies & {
  writeEmailLog: ReturnType<typeof vi.fn>;
  persistFailureAlert: ReturnType<typeof vi.fn>;
} {
  return {
    sendEmail,
    writeEmailLog: vi.fn().mockResolvedValue({ error: null }),
    persistFailureAlert: vi.fn().mockResolvedValue(undefined),
    logError: vi.fn(),
    logInfo: vi.fn(),
  };
}

describe('deliverAuthEmail', () => {
  it('records a successful Resend acceptance without raising an alert', async () => {
    const sendEmail = vi.fn().mockResolvedValue(Response.json({ id: 'email-1' }, { status: 200 }));
    const deps = dependencies(sendEmail);

    await expect(deliverAuthEmail(input, deps)).resolves.toEqual({
      status: 'sent',
      resendMessageId: 'email-1',
      failureCategory: undefined,
      errorMessage: undefined,
    });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining(
          '"tags":[{"name":"myk9_email_type","value":"auth_confirmation"}]'
        ),
      })
    );
    expect(deps.writeEmailLog).toHaveBeenCalledWith(
      expect.objectContaining({
        resend_message_id: 'email-1',
        status: 'sent',
      })
    );
    expect(deps.persistFailureAlert).not.toHaveBeenCalled();
  });

  it('classifies a provider 429 and persists the operator alert', async () => {
    const deps = dependencies(() =>
      Promise.resolve(new Response('quota exceeded', { status: 429 }))
    );

    await deliverAuthEmail(input, deps);

    expect(deps.persistFailureAlert).toHaveBeenCalledWith({
      actionType: 'signup',
      recipientEmail: 'new@example.com',
      category: 'rate_limited',
      errorMessage: 'quota exceeded',
    });
    expect(deps.writeEmailLog).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error_message: 'quota exceeded',
      })
    );
  });

  it('classifies a provider rejection', async () => {
    const deps = dependencies(() =>
      Promise.resolve(new Response('domain not verified', { status: 403 }))
    );

    await deliverAuthEmail(input, deps);

    expect(deps.persistFailureAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'provider_error',
        errorMessage: 'domain not verified',
      })
    );
  });

  it('classifies a network failure', async () => {
    const deps = dependencies(() => Promise.reject(new Error('network unavailable')));

    await deliverAuthEmail(input, deps);

    expect(deps.persistFailureAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'network_error',
        errorMessage: 'network unavailable',
      })
    );
  });

  it('records missing provider configuration without attempting a send', async () => {
    const sendEmail = vi.fn();
    const deps = dependencies(sendEmail);

    await deliverAuthEmail({ ...input, resendApiKey: undefined }, deps);

    expect(sendEmail).not.toHaveBeenCalled();
    expect(deps.persistFailureAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'configuration',
        errorMessage: 'RESEND_API_KEY not configured',
      })
    );
  });
});
