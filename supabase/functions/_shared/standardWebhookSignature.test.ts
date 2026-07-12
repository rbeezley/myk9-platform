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
  it('fails closed when the webhook secret is missing', async () => {
    const result = await verifyStandardWebhookSignature({
      headers: new Headers(),
      body: '{"type":"signup"}',
      secret: undefined,
      nowMs: 1_000_000,
    });

    expect(result).toEqual({
      ok: false,
      status: 503,
      message: 'Webhook verification not configured',
    });
  });

  it('rejects unsigned payloads before auth email handling', async () => {
    const result = await verifyStandardWebhookSignature({
      headers: new Headers(),
      body: '{"type":"signup"}',
      secret,
      nowMs: 1_000_000,
    });

    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it('rejects malformed timestamps instead of accepting a numeric prefix', async () => {
    const body = '{"type":"signup"}';
    const signature = await sign(body, 'msg_1', '1000-not-a-timestamp');

    const result = await verifyStandardWebhookSignature({
      headers: new Headers({
        'webhook-id': 'msg_1',
        'webhook-timestamp': '1000-not-a-timestamp',
        'webhook-signature': signature,
      }),
      body,
      secret,
      nowMs: 1_000_000,
    });

    expect(result).toEqual({
      ok: false,
      status: 401,
      message: 'Invalid signature timestamp',
    });
  });

  it('rejects signatures outside the five-minute clock-skew window', async () => {
    const body = '{"type":"signup"}';
    const signature = await sign(body, 'msg_1', '699');

    const result = await verifyStandardWebhookSignature({
      headers: new Headers({
        'webhook-id': 'msg_1',
        'webhook-timestamp': '699',
        'webhook-signature': signature,
      }),
      body,
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

  it('accepts a valid v1 signature among multiple versioned signatures', async () => {
    const body = '{"type":"signup"}';
    const signature = await sign(body, 'msg_1', '1000');

    const result = await verifyStandardWebhookSignature({
      headers: new Headers({
        'webhook-id': 'msg_1',
        'webhook-timestamp': '1000',
        'webhook-signature': `v1,invalid v2,ignored ${signature}`,
      }),
      body,
      secret,
      nowMs: 1_000_000,
    });

    expect(result).toEqual({ ok: true, status: 200 });
  });

  it('accepts hook secrets copied from the Supabase dashboard with a v1 prefix', async () => {
    const body = '{"type":"signup"}';
    const signature = await sign(body, 'msg_1', '1000');

    const result = await verifyStandardWebhookSignature({
      headers: new Headers({
        'webhook-id': 'msg_1',
        'webhook-timestamp': '1000',
        'webhook-signature': signature,
      }),
      body,
      secret: `v1,${secret}`,
      nowMs: 1_000_000,
    });

    expect(result).toEqual({ ok: true, status: 200 });
  });

});
