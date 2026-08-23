import { describe, expect, it, vi } from 'vitest';
import { sendTrialPacketEmail, TrialPacketProviderError } from './email.ts';

const input = {
  apiKey: 'resend-key',
  idempotencyKey: 'trial-packet-snapshot-1-secretary@example.com',
  from: 'myK9Show <notifications@myk9show.com>',
  recipient: 'secretary@example.com',
  subject: 'Print this packet',
  html: '<p>Print it</p>',
};

describe('sendTrialPacketEmail', () => {
  it('sends the idempotency key it was given, so a retry cannot duplicate mail', async () => {
    const send = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'message-1' }), { status: 200 })
    );

    await expect(sendTrialPacketEmail(input, send)).resolves.toBe('message-1');
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': input.idempotencyKey }),
      })
    );
  });

  it('addresses exactly one recipient per call', async () => {
    // The key invariant behind per-recipient delivery tracking: Resend returns
    // one id per message, and resend-webhook maps that id to exactly one
    // email_log row. A second address here would silently re-create the
    // ambiguity where one bounce marked everyone bounced.
    const send = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'message-1' }), { status: 200 })
    );

    await sendTrialPacketEmail(input, send);

    const body = JSON.parse((send.mock.calls[0][0] as { body: string }).body);
    expect(body.to).toEqual(['secretary@example.com']);
  });

  it('normalizes network and provider failures for append-only audit handling', async () => {
    await expect(
      sendTrialPacketEmail(input, vi.fn().mockRejectedValue(new Error('offline')))
    ).rejects.toMatchObject({ status: 'network_error' } satisfies Partial<TrialPacketProviderError>);
    await expect(
      sendTrialPacketEmail(input, vi.fn().mockResolvedValue(new Response('no', { status: 503 })))
    ).rejects.toMatchObject({ status: 503 } satisfies Partial<TrialPacketProviderError>);
  });
});
