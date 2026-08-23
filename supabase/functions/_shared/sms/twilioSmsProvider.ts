import { SmsSendError, type SmsProvider } from './smsProvider.ts';

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

      // EVERY throw below carries a delivery state, because the caller's
      // release-the-claim decision turns on it and a bare Error erases the one
      // fact it needs (MYK9-193 review). See SmsDeliveryState.
      let response: Response;
      try {
        response = await fetchImpl(
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
      } catch (error) {
        // A timeout or socket error says nothing about whether Twilio received
        // the request. Twilio commonly acknowledges slower than this timeout
        // under load, so the message may well be queued and billed already.
        throw new SmsSendError(
          `SMS provider request failed: ${error instanceof Error ? error.message : String(error)}`,
          'unknown'
        );
      }

      if (!response.ok) {
        // A non-2xx is Twilio declining the message. Nothing is queued and
        // nothing is billed, so the caller may safely release its claim.
        throw new SmsSendError('SMS provider rejected the message', 'not-sent');
      }

      let payload: { sid?: unknown };
      try {
        payload = (await response.json()) as { sid?: unknown };
      } catch {
        // 2xx already means accepted and billed; we simply cannot read the sid.
        throw new SmsSendError('SMS provider response could not be parsed', 'unknown');
      }
      if (typeof payload.sid !== 'string' || !payload.sid) {
        // Same: the message was ACCEPTED. Do not let the caller release.
        throw new SmsSendError('SMS provider returned an invalid response', 'unknown');
      }
      return { messageId: payload.sid };
    },
  };
}
