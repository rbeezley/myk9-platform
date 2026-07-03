import { describe, expect, it } from 'vitest';

import { HttpError } from '../_shared/http/responses.ts';
import { requireConfirmationEmailSecret } from './auth.ts';

function requestWithSecret(secret?: string): Request {
  const headers = new Headers();
  if (secret) headers.set('x-function-secret', secret);
  return new Request('https://example.test/send-confirmation-email', {
    method: 'POST',
    headers,
  });
}

describe('requireConfirmationEmailSecret', () => {
  it('fails closed with 503 when HERITAGE_CONFIRMATION_SECRET is missing', () => {
    expect(() =>
      requireConfirmationEmailSecret(requestWithSecret('anything'), () => undefined)
    ).toThrowError(HttpError);

    try {
      requireConfirmationEmailSecret(requestWithSecret('anything'), () => undefined);
      throw new Error('expected helper to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).status).toBe(503);
      expect((error as HttpError).message).toBe('Confirmation email auth not configured');
    }
  });

  it('rejects a missing or wrong header with 401', () => {
    for (const request of [requestWithSecret(), requestWithSecret('wrong')]) {
      try {
        requireConfirmationEmailSecret(request, name =>
          name === 'HERITAGE_CONFIRMATION_SECRET' ? 'expected-secret' : undefined
        );
        throw new Error('expected helper to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).status).toBe(401);
        expect((error as HttpError).message).toBe('Unauthorized');
      }
    }
  });

  it('allows a matching header', () => {
    expect(() =>
      requireConfirmationEmailSecret(requestWithSecret('expected-secret'), name =>
        name === 'HERITAGE_CONFIRMATION_SECRET' ? 'expected-secret' : undefined
      )
    ).not.toThrow();
  });
});
