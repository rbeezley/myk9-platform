import { describe, expect, it, vi } from 'vitest';
import { sendTrialPacketEmail, TrialPacketProviderError } from './email.ts';

const input = {
  apiKey: 'resend-key',
  snapshotId: 'snapshot-1',
  from: 'myK9Show <notifications@myk9show.com>',
  recipients: ['secretary@example.com'],
  subject: 'Print this packet',
  html: '<p>Print it</p>',
};

describe('sendTrialPacketEmail', () => {
  it('uses a stable snapshot idempotency key so retries do not duplicate mail', async () => {
    const send = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'message-1' }), { status: 200 })
    );

    await expect(sendTrialPacketEmail(input, send)).resolves.toBe('message-1');
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': 'trial-packet-snapshot-1' }),
      })
    );
  });

  it('normalizes network and provider failures for append-only audit handling', async () => {
    await expect(
      sendTrialPacketEmail(input, vi.fn().mockRejectedValue(new Error('offline')))
    ).rejects.toMatchObject<Partial<TrialPacketProviderError>>({ status: 'network_error' });
    await expect(
      sendTrialPacketEmail(input, vi.fn().mockResolvedValue(new Response('no', { status: 503 })))
    ).rejects.toMatchObject<Partial<TrialPacketProviderError>>({ status: 503 });
  });
});
