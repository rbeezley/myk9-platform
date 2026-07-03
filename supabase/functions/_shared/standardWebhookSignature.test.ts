import { describe, expect, it } from 'vitest';

import { verifyStandardWebhookSignature } from './standardWebhookSignature';

const secret = `whsec_${btoa('test-secret')}`;

async function sign(body: string, id: string, timestamp: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('test-secret'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`)
  );
  return `v1,${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;
}

describe('Standard-Webhooks signature verification', () => {
  it('rejects unsigned payloads before auth email handling', async () => {
    const result = await verifyStandardWebhookSignature({
      headers: new Headers(),
      body: '{"type":"signup"}',
      secret,
      nowMs: 1_000_000,
    });

    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it('rejects badly signed payloads before auth email handling', async () => {
    const result = await verifyStandardWebhookSignature({
      headers: new Headers({
        'webhook-id': 'msg_1',
        'webhook-timestamp': '1000',
        'webhook-signature': 'v1,bad',
      }),
      body: '{"type":"signup"}',
      secret,
      nowMs: 1_000_000,
    });

    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it('accepts correctly signed Standard-Webhooks payloads', async () => {
    const body = '{"type":"signup"}';
    const signature = await sign(body, 'msg_1', '1000');

    const result = await verifyStandardWebhookSignature({
      headers: new Headers({
        'webhook-id': 'msg_1',
        'webhook-timestamp': '1000',
        'webhook-signature': signature,
      }),
      body,
      secret,
      nowMs: 1_000_000,
    });

    expect(result).toEqual({ ok: true, status: 200 });
  });

  it('fails closed when the hook secret is missing', async () => {
    const result = await verifyStandardWebhookSignature({
      headers: new Headers({
        'webhook-id': 'msg_1',
        'webhook-timestamp': '1000',
        'webhook-signature': 'v1,bad',
      }),
      body: '{"type":"signup"}',
      secret: undefined,
      nowMs: 1_000_000,
    });

    expect(result).toMatchObject({ ok: false, status: 503 });
  });
});
