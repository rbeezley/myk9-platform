import { describe, expect, it, vi } from 'vitest';
import { createTwilioSmsProvider, readTwilioConfig } from './twilioSmsProvider';

const CONFIG = {
  accountSid: 'AC123',
  authToken: 'secret-token',
  messagingServiceSid: 'MG123',
};

describe('readTwilioConfig', () => {
  it.each(['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_MESSAGING_SERVICE_SID'] as const)(
    'fails closed when %s is missing',
    missing => {
      const values: Record<string, string> = {
        TWILIO_ACCOUNT_SID: CONFIG.accountSid,
        TWILIO_AUTH_TOKEN: CONFIG.authToken,
        TWILIO_MESSAGING_SERVICE_SID: CONFIG.messagingServiceSid,
      };
      delete values[missing];

      expect(() => readTwilioConfig(name => values[name])).toThrow(
        'SMS provider is not configured'
      );
    }
  );
});

describe('createTwilioSmsProvider', () => {
  it('posts through the Messaging Service with Basic authentication', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ sid: 'SM123' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const provider = createTwilioSmsProvider(CONFIG, fetchMock);

    await expect(provider.send({ to: '+12105550142', body: 'hello' })).resolves.toEqual({
      messageId: 'SM123',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa('AC123:secret-token')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    expect(String(init?.body)).toBe('To=%2B12105550142&Body=hello&MessagingServiceSid=MG123');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('throws a sanitized error when Twilio rejects the send', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ message: 'bad destination +12105550142' }), { status: 400 })
      );

    await expect(
      createTwilioSmsProvider(CONFIG, fetchMock).send({ to: '+12105550142', body: 'hello' })
    ).rejects.toThrow('SMS provider rejected the message');
  });

  it('aborts a provider request that exceeds the bounded timeout', async () => {
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    });

    await expect(
      createTwilioSmsProvider(CONFIG, fetchMock, 5).send({
        to: '+12105550142',
        body: 'hello',
      })
    ).rejects.toBeDefined();
  });
});
