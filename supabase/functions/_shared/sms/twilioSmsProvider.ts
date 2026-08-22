import type { SmsProvider } from './smsProvider.ts';

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  messagingServiceSid: string;
}

type GetEnv = (name: string) => string | undefined;

export function readTwilioConfig(getEnv: GetEnv): TwilioConfig {
  const accountSid = getEnv('TWILIO_ACCOUNT_SID')?.trim();
  const authToken = getEnv('TWILIO_AUTH_TOKEN')?.trim();
  const messagingServiceSid = getEnv('TWILIO_MESSAGING_SERVICE_SID')?.trim();

  if (!accountSid || !authToken || !messagingServiceSid) {
    throw new Error('SMS provider is not configured');
  }

  return { accountSid, authToken, messagingServiceSid };
}

export function createTwilioSmsProvider(
  config: TwilioConfig,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 8_000
): SmsProvider {
  return {
    async send(input) {
      const form = new URLSearchParams({
        To: input.to,
        Body: input.body,
        MessagingServiceSid: config.messagingServiceSid,
      });
      const authorization = btoa(`${config.accountSid}:${config.authToken}`);
      const response = await fetchImpl(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${authorization}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form,
          signal: AbortSignal.timeout(timeoutMs),
        }
      );

      if (!response.ok) {
        throw new Error('SMS provider rejected the message');
      }

      const payload = (await response.json()) as { sid?: unknown };
      if (typeof payload.sid !== 'string' || !payload.sid) {
        throw new Error('SMS provider returned an invalid response');
      }
      return { messageId: payload.sid };
    },
  };
}
