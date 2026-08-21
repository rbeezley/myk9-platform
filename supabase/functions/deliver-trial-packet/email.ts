import {
  sendResendEmailWithRetry,
  type ResendEmailRequestInit,
} from '../_shared/resendEmail.ts';

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
    snapshotId: string;
    from: string;
    recipients: string[];
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
        'Idempotency-Key': `trial-packet-${input.snapshotId}`,
      },
      body: JSON.stringify({
        from: input.from,
        to: input.recipients,
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
