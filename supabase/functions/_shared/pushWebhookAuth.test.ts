import { describe, expect, it } from 'vitest';
import { HttpError } from './http/responses';
import { requirePushWebhookSecret } from './pushWebhookAuth';

function env(vars: Record<string, string | undefined>) {
  return (name: string) => vars[name];
}

function request(authorization?: string): Request {
  return new Request('https://example.test/webhook', {
    method: 'POST',
    headers: authorization ? { Authorization: authorization } : {},
  });
}

function expectHttpError(error: unknown, status: number, message: string) {
  expect(error).toBeInstanceOf(HttpError);
  expect((error as HttpError).status).toBe(status);
  expect((error as HttpError).message).toBe(message);
}

describe('requirePushWebhookSecret', () => {
  it('accepts the exact dedicated push secret', () => {
    expect(() =>
      requirePushWebhookSecret(
        request('Bearer push-secret'),
        env({ PUSH_WEBHOOK_SECRET: 'push-secret' })
      )
    ).not.toThrow();
  });

  it('rejects missing auth headers before webhook handling', () => {
    try {
      requirePushWebhookSecret(request(), env({ PUSH_WEBHOOK_SECRET: 'push-secret' }));
      throw new Error('Expected requirePushWebhookSecret to throw');
    } catch (error) {
      expectHttpError(error, 401, 'Unauthorized');
    }
  });

  it('rejects the service-role key when the dedicated push secret is not set', () => {
    try {
      requirePushWebhookSecret(
        request('Bearer service-role-key'),
        env({ SUPABASE_SERVICE_ROLE_KEY: 'service-role-key' })
      );
      throw new Error('Expected requirePushWebhookSecret to throw');
    } catch (error) {
      expectHttpError(error, 503, 'Push trigger is not configured');
    }
  });

  it('rejects a service-role bearer when a different dedicated secret is configured', () => {
    try {
      requirePushWebhookSecret(
        request('Bearer service-role-key'),
        env({
          PUSH_WEBHOOK_SECRET: 'push-secret',
          SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        })
      );
      throw new Error('Expected requirePushWebhookSecret to throw');
    } catch (error) {
      expectHttpError(error, 401, 'Unauthorized');
    }
  });

  it('rejects when no webhook secret is configured', () => {
    try {
      requirePushWebhookSecret(request('Bearer anything'), env({}));
      throw new Error('Expected requirePushWebhookSecret to throw');
    } catch (error) {
      expectHttpError(error, 503, 'Push trigger is not configured');
    }
  });

  it('rejects a same-length wrong bearer value', () => {
    try {
      requirePushWebhookSecret(
        request('Bearer push-secreu'),
        env({ PUSH_WEBHOOK_SECRET: 'push-secret' })
      );
      throw new Error('Expected requirePushWebhookSecret to throw');
    } catch (error) {
      expectHttpError(error, 401, 'Unauthorized');
    }
  });

  it('rejects a wrong-length bearer value without throwing a comparison error', () => {
    try {
      requirePushWebhookSecret(request('Bearer push'), env({ PUSH_WEBHOOK_SECRET: 'push-secret' }));
      throw new Error('Expected requirePushWebhookSecret to throw');
    } catch (error) {
      expectHttpError(error, 401, 'Unauthorized');
    }
  });
});
