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
  it('rejects missing auth headers before webhook handling', () => {
    try {
      requirePushWebhookSecret(request(), env({ PUSH_WEBHOOK_SECRET: 'push-secret' }));
      throw new Error('Expected requirePushWebhookSecret to throw');
    } catch (error) {
      expectHttpError(error, 401, 'Unauthorized');
    }
  });

  it('falls back to the service-role key when the dedicated push secret is not set', () => {
    expect(() =>
      requirePushWebhookSecret(
        request('Bearer service-role-key'),
        env({ SUPABASE_SERVICE_ROLE_KEY: 'service-role-key' })
      )
    ).not.toThrow();
  });

  it('rejects when no webhook secret is configured', () => {
    try {
      requirePushWebhookSecret(request('Bearer anything'), env({}));
      throw new Error('Expected requirePushWebhookSecret to throw');
    } catch (error) {
      expectHttpError(error, 503, 'Push trigger is not configured');
    }
  });
});
