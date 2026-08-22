// @vitest-environment node
//
// Edge-function code runs under Deno, never in a browser. The app suite sets
// jsdom globally, and jsdom installs its own ArrayBuffer while providing no
// crypto.subtle — so a buffer built in test code belongs to a different realm
// than the Node crypto vitest leaves in place, and digest/sign rejects it. This
// file must stay on the node environment.
import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';

import { parseFormBody, resolveSignedUrl, verifyTwilioSignature } from './twilioSignature.ts';

const AUTH_TOKEN = 'test-auth-token-0123456789';
const URL_UNDER_TEST = 'https://example.supabase.co/functions/v1/sms-stop-webhook';

/**
 * An INDEPENDENT implementation of Twilio's documented scheme, written from the
 * spec rather than by calling the code under test: sort the POST params by
 * name, append each name immediately followed by its value to the full URL,
 * HMAC-SHA1 with the auth token, base64. If the production implementation and
 * this one agree, the production one matches the documented algorithm.
 */
function signLikeTwilio(url: string, params: Record<string, string>): string {
  const base = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac('sha1', AUTH_TOKEN).update(base, 'utf8').digest('base64');
}

function form(params: Record<string, string>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, [value]]));
}

describe('verifyTwilioSignature', () => {
  const params = { From: '+12105550142', Body: 'STOP', MessageSid: 'SM123' };

  it("matches Twilio's own published test vector", async () => {
    // The canonical example from Twilio's request-validation documentation.
    // Our own re-derivation of the algorithm only proves we agree with
    // ourselves; this pins the implementation to a signature Twilio published,
    // and it is what proves the query string is included and that name and
    // value are concatenated with no delimiter.
    const result = await verifyTwilioSignature({
      url: 'https://mycompany.com/myapp.php?foo=1&bar=2',
      params: form({
        CallSid: 'CA1234567890ABCDE',
        Caller: '+14158675309',
        Digits: '1234',
        From: '+14158675309',
        To: '+18005551212',
      }),
      signature: 'RSOYDt4T1cUTdK1PDd93/VVr8B8=',
      authToken: '12345',
    });
    expect(result).toEqual({ ok: true });
  });

  it('accepts a signature produced by the documented Twilio algorithm', async () => {
    const result = await verifyTwilioSignature({
      url: URL_UNDER_TEST,
      params: form(params),
      signature: signLikeTwilio(URL_UNDER_TEST, params),
      authToken: AUTH_TOKEN,
    });
    expect(result).toEqual({ ok: true });
  });

  it('does not depend on the order the body fields arrived in', async () => {
    // Same fields, reversed insertion order — the base string is sorted, so the
    // signature must still verify.
    const reversed = Object.fromEntries(Object.entries(form(params)).reverse()) as Record<
      string,
      string[]
    >;
    const result = await verifyTwilioSignature({
      url: URL_UNDER_TEST,
      params: reversed,
      signature: signLikeTwilio(URL_UNDER_TEST, params),
      authToken: AUTH_TOKEN,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a body tampered with after signing', async () => {
    // The attack this exists to stop: a valid signature for "STOP" replayed
    // with the body swapped to someone else's number.
    const signature = signLikeTwilio(URL_UNDER_TEST, params);
    const result = await verifyTwilioSignature({
      url: URL_UNDER_TEST,
      params: form({ ...params, From: '+12105550199' }),
      signature,
      authToken: AUTH_TOKEN,
    });
    expect(result).toEqual({ ok: false, status: 403, message: 'Invalid signature' });
  });

  it('rejects a signature made with a different auth token', async () => {
    const foreign = createHmac('sha1', 'someone-elses-token')
      .update(URL_UNDER_TEST + 'BodySTOPFrom+12105550142MessageSidSM123', 'utf8')
      .digest('base64');
    const result = await verifyTwilioSignature({
      url: URL_UNDER_TEST,
      params: form(params),
      signature: foreign,
      authToken: AUTH_TOKEN,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a request signed for a different URL', async () => {
    const result = await verifyTwilioSignature({
      url: URL_UNDER_TEST,
      params: form(params),
      signature: signLikeTwilio('https://evil.example/functions/v1/sms-stop-webhook', params),
      authToken: AUTH_TOKEN,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects an unsigned request', async () => {
    const result = await verifyTwilioSignature({
      url: URL_UNDER_TEST,
      params: form(params),
      signature: null,
      authToken: AUTH_TOKEN,
    });
    expect(result).toEqual({ ok: false, status: 401, message: 'Missing signature' });
  });

  it('fails closed when the auth token is not configured', async () => {
    // The failure mode this guards: an unconfigured webhook that accepts
    // everything looks healthy while anyone can write opt-out rows. It must
    // refuse, not wave requests through.
    for (const authToken of [undefined, '', '   ']) {
      const result = await verifyTwilioSignature({
        url: URL_UNDER_TEST,
        params: form(params),
        signature: signLikeTwilio(URL_UNDER_TEST, params),
        authToken,
      });
      expect(result).toEqual({
        ok: false,
        status: 503,
        message: 'Signature verification is not configured',
      });
    }
  });
});

describe('parseFormBody', () => {
  it('decodes percent-encoded values', () => {
    expect(parseFormBody('From=%2B12105550142&Body=STOP+please')).toEqual({
      From: ['+12105550142'],
      Body: ['STOP please'],
    });
  });

  it('keeps every value of a repeated field', () => {
    expect(parseFormBody('Media=a&Media=b')).toEqual({ Media: ['a', 'b'] });
  });
});

describe('resolveSignedUrl', () => {
  it('prefers the configured URL, because a proxy rewrite breaks every signature', () => {
    expect(resolveSignedUrl('http://internal:8000/x', 'https://public.example/x')).toBe(
      'https://public.example/x'
    );
  });

  it('falls back to the request URL when nothing is configured', () => {
    for (const configured of [undefined, '', '  ']) {
      expect(resolveSignedUrl('https://public.example/x', configured)).toBe(
        'https://public.example/x'
      );
    }
  });
});
