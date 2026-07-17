import { describe, expect, it, vi } from 'vitest';

import { createWebhookRequestHandler, verifyWebhookSignature } from './webhookHandler';

interface FakeStripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

function makeEvent(overrides: Partial<FakeStripeEvent> = {}): FakeStripeEvent {
  return {
    id: 'evt_123',
    type: 'checkout.session.completed',
    data: { object: {} },
    ...overrides,
  };
}

function makeRequest(init: { method?: string; signature?: string | null; body?: string }): Request {
  const headers = new Headers();
  if (init.signature !== null) {
    headers.set('stripe-signature', init.signature ?? 'sig_test');
  }
  const method = init.method ?? 'POST';
  const bodyless = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
  return new Request('https://example.test/stripe-webhook', {
    method,
    headers,
    ...(bodyless ? {} : { body: init.body ?? '{}' }),
  });
}

describe('verifyWebhookSignature', () => {
  it('verifies against the platform secret when it succeeds', async () => {
    const verifyEvent = vi.fn(async () => makeEvent());

    const event = await verifyWebhookSignature(
      { verifyEvent, platformSecret: 'platform_secret' },
      'body',
      'sig'
    );

    expect(event.id).toBe('evt_123');
    expect(verifyEvent).toHaveBeenCalledTimes(1);
    expect(verifyEvent).toHaveBeenCalledWith('body', 'sig', 'platform_secret');
  });

  it('falls back to the Connect secret when the platform secret fails and one is configured', async () => {
    const verifyEvent = vi
      .fn()
      .mockRejectedValueOnce(new Error('bad platform sig'))
      .mockResolvedValueOnce(makeEvent({ id: 'evt_connect' }));

    const event = await verifyWebhookSignature(
      { verifyEvent, platformSecret: 'platform_secret', connectSecret: 'connect_secret' },
      'body',
      'sig'
    );

    expect(event.id).toBe('evt_connect');
    expect(verifyEvent).toHaveBeenNthCalledWith(1, 'body', 'sig', 'platform_secret');
    expect(verifyEvent).toHaveBeenNthCalledWith(2, 'body', 'sig', 'connect_secret');
  });

  it('rethrows the platform error when no Connect secret is configured', async () => {
    const platformError = new Error('bad signature');
    const verifyEvent = vi.fn().mockRejectedValueOnce(platformError);

    await expect(
      verifyWebhookSignature({ verifyEvent, platformSecret: 'platform_secret' }, 'body', 'sig')
    ).rejects.toThrow('bad signature');
    expect(verifyEvent).toHaveBeenCalledTimes(1);
  });

  it('rethrows the Connect-secret error (not the platform error) when both fail', async () => {
    const verifyEvent = vi
      .fn()
      .mockRejectedValueOnce(new Error('bad platform sig'))
      .mockRejectedValueOnce(new Error('bad connect sig'));

    await expect(
      verifyWebhookSignature(
        { verifyEvent, platformSecret: 'platform_secret', connectSecret: 'connect_secret' },
        'body',
        'sig'
      )
    ).rejects.toThrow('bad connect sig');
  });
});

describe('createWebhookRequestHandler', () => {
  function makeDeps(overrides: Partial<Parameters<typeof createWebhookRequestHandler>[0]> = {}) {
    return {
      verifyEvent: vi.fn(async () => makeEvent()),
      platformSecret: 'platform_secret',
      dispatch: vi.fn(async () => undefined),
      alertAdmin: vi.fn(async () => undefined),
      ...overrides,
    };
  }

  it('responds 204 to OPTIONS without touching verification or dispatch', async () => {
    const deps = makeDeps();
    const handler = createWebhookRequestHandler(deps);

    const response = await handler(makeRequest({ method: 'OPTIONS' }));

    expect(response.status).toBe(204);
    expect(deps.verifyEvent).not.toHaveBeenCalled();
    expect(deps.dispatch).not.toHaveBeenCalled();
  });

  it('rejects non-POST methods with 405', async () => {
    const deps = makeDeps();
    const handler = createWebhookRequestHandler(deps);

    const response = await handler(makeRequest({ method: 'GET' }));

    expect(response.status).toBe(405);
    expect(deps.verifyEvent).not.toHaveBeenCalled();
  });

  it('rejects a request with no stripe-signature header with 400', async () => {
    const deps = makeDeps();
    const handler = createWebhookRequestHandler(deps);

    const response = await handler(makeRequest({ signature: null }));

    expect(response.status).toBe(400);
    expect(await response.text()).toBe('No signature found');
    expect(deps.verifyEvent).not.toHaveBeenCalled();
  });

  it('rejects a bad signature with 400 and does not dispatch', async () => {
    const deps = makeDeps({
      verifyEvent: vi.fn().mockRejectedValue(new Error('signature mismatch')),
    });
    const handler = createWebhookRequestHandler(deps);

    const response = await handler(makeRequest({}));

    expect(response.status).toBe(400);
    expect(await response.text()).toContain('signature mismatch');
    expect(deps.dispatch).not.toHaveBeenCalled();
    expect(deps.alertAdmin).not.toHaveBeenCalled();
  });

  it('dispatches a verified event and acks with received: true', async () => {
    const event = makeEvent({ type: 'customer.subscription.updated' });
    const deps = makeDeps({ verifyEvent: vi.fn(async () => event) });
    const handler = createWebhookRequestHandler(deps);

    const response = await handler(makeRequest({}));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(deps.dispatch).toHaveBeenCalledWith(event);
  });

  it('acks unknown/unhandled event types the same way, relying on dispatch to no-op', async () => {
    // The dispatch function (handleEvent's switch) owns "unhandled event"
    // logging; the request handler acks any event dispatch resolves for.
    const event = makeEvent({ type: 'some.unhandled.event' });
    const deps = makeDeps({ verifyEvent: vi.fn(async () => event) });
    const handler = createWebhookRequestHandler(deps);

    const response = await handler(makeRequest({}));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(deps.dispatch).toHaveBeenCalledWith(event);
  });

  it('surfaces dispatch errors as a 500 with the error message and alerts with a dedupe key', async () => {
    const event = makeEvent({ id: 'evt_fail' });
    const deps = makeDeps({
      verifyEvent: vi.fn(async () => event),
      dispatch: vi.fn().mockRejectedValue(new Error('db write failed')),
    });
    const handler = createWebhookRequestHandler(deps);

    const response = await handler(makeRequest({}));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'db write failed' });
    expect(deps.alertAdmin).toHaveBeenCalledTimes(1);
    expect(deps.alertAdmin).toHaveBeenCalledWith(
      'Webhook handler failed before acknowledgment',
      expect.stringContaining('db write failed'),
      expect.objectContaining({
        source: 'stripe-webhook',
        dedupeKey: 'handler-failed-evt_fail',
        detail: { eventId: 'evt_fail', message: 'db write failed' },
      })
    );
  });

  it('alerts without a dedupe key when the error happens before signature verification resolves an event id', async () => {
    const deps = makeDeps({
      verifyEvent: vi.fn(async () => makeEvent()),
      dispatch: vi.fn(async () => undefined),
    });
    // Force the try block to throw after verification but before eventId
    // assignment is impossible via public API, so instead simulate a
    // verification success followed by a body-read failure path: use a
    // request whose .text() rejects.
    const badRequest = new Request('https://example.test/stripe-webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig_test' },
      body: 'irrelevant',
    });
    Object.defineProperty(badRequest, 'text', {
      value: () => Promise.reject(new Error('stream error')),
    });
    const handler = createWebhookRequestHandler(deps);

    const response = await handler(badRequest);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'stream error' });
    expect(deps.alertAdmin).toHaveBeenCalledWith(
      'Webhook handler failed before acknowledgment',
      expect.any(String),
      expect.objectContaining({ dedupeKey: undefined })
    );
    expect(deps.verifyEvent).not.toHaveBeenCalled();
  });

  it('still returns 500 when alertAdmin itself throws', async () => {
    const deps = makeDeps({
      dispatch: vi.fn().mockRejectedValue(new Error('boom')),
      alertAdmin: vi.fn().mockRejectedValue(new Error('alert channel down')),
    });
    const handler = createWebhookRequestHandler(deps);

    const response = await handler(makeRequest({}));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'boom' });
  });
});
