import {
  sendResendEmailWithRetry,
  type ResendEmailRequestInit,
} from '../resendEmail.ts';

export class TrialPacketProviderError extends Error {
  readonly status: number | 'network_error';

  constructor(status: number | 'network_error') {
    super('Trial packet email provider failed.');
    this.name = 'TrialPacketProviderError';
    this.status = status;
  }
}

export async function sendTrialPacketEmail(
  input: {
    apiKey: string;
    /**
     * ONE recipient per call, deliberately.
     *
     * This used to take the whole list and send a single message. Resend then
     * returns ONE message id for the lot, and `resend-webhook` keys delivery
     * events on that id -- so a bounce for any one official flipped the record
     * for all of them. There was no way to answer "did the secretary's copy
     * land", which for an emergency packet is the only question that matters.
     */
    recipient: string;
    /**
     * MUST be unique per recipient. Resend returns the ORIGINAL response for a
     * repeated Idempotency-Key, so reusing one key across a loop would silently
     * deliver to the first address and hand back its id for every other --
     * logging four successes for one email sent.
     */
    idempotencyKey: string;
    from: string;
    subject: string;
    html: string;
  },
  send: (init: ResendEmailRequestInit) => Promise<Response> = sendResendEmailWithRetry,
): Promise<string | null> {
  let response: Response;
  try {
    response = await send({
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        from: input.from,
        to: [input.recipient],
        subject: input.subject,
        html: input.html,
      }),
    });
  } catch {
    throw new TrialPacketProviderError('network_error');
  }
  if (!response.ok) {
    await response.text();
    throw new TrialPacketProviderError(response.status);
  }
  const result = (await response.json()) as { id?: string };
  return result.id ?? null;
}
