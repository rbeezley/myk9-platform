import { describe, expect, it } from 'vitest';

import { redactSecretLikeString, redactSecretLikeValue } from './redaction';

describe('redactSecretLikeString', () => {
  it('redacts JWT and Bearer token strings', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abcDEF123456';

    const out = redactSecretLikeString(`Authorization: Bearer ${jwt}`);

    expect(out).not.toContain(jwt);
    expect(out).toBe('Authorization: Bearer [redacted]');
  });

  it('redacts secret-looking query and key-value parameters', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature_123';

    const out = redactSecretLikeString(
      `https://app.example/auth#id_token=${jwt}&token=plain client_secret=cs_test_secret`
    );

    expect(out).not.toContain(jwt);
    expect(out).not.toContain('plain');
    expect(out).not.toContain('cs_test_secret');
    expect(out).toContain('#id_token=[redacted]');
    expect(out).toContain('&token=[redacted]');
    expect(out).toContain('client_secret=[redacted]');
  });

  it('redacts Stripe, webhook, Supabase secret keys, and checkout URLs', () => {
    const out = redactSecretLikeString(
      [
        'sk_live_abcdefgh12345678',
        'whsec_abcdefgh12345678',
        'sb_secret_abcdefgh12345678',
        'https://checkout.stripe.com/c/pay/cs_test_a1b2c3#fidSecret',
      ].join(' ')
    );

    expect(out).toBe('[redacted-secret] [redacted-secret] [redacted-secret] [redacted-url]');
  });

  it('leaves ordinary strings untouched', () => {
    expect(redactSecretLikeString('open support ticket')).toBe('open support ticket');
  });

  // MYK9-550: KEY_VALUE_SECRET_RE ran before BEARER_RE and its value class ([^&#\s]+)
  // stopped at whitespace, so `token=Bearer <token>` matched only `token=Bearer`,
  // deleting the literal "Bearer" that BEARER_RE needed as its anchor -- leaving the
  // token itself un-redacted downstream.
  it('redacts the full value when a key=value pair carries a Bearer-scheme token (MYK9-550)', () => {
    expect(redactSecretLikeString('token=Bearer opaque-token-value-1234')).toBe('token=[redacted]');
  });

  it('redacts a Bearer-scheme value on the authorization key= param (MYK9-550)', () => {
    expect(redactSecretLikeString('authorization=Bearer sb_publishable_abc123defghijklmnop')).toBe(
      'authorization=[redacted]'
    );
  });

  it('redacts a Bearer-scheme value on the apikey= param (MYK9-550)', () => {
    expect(redactSecretLikeString('apikey=Bearer rk_live_0123456789abcdef')).toBe(
      'apikey=[redacted]'
    );
  });

  it('redacts an Authorization header Bearer token with no = sign (MYK9-550, already correct)', () => {
    expect(redactSecretLikeString('Authorization: Bearer sbp_0123456789abcdef0123456789')).toBe(
      'Authorization: Bearer [redacted]'
    );
  });

  it('redacts an Authorization header Bearer JWT with no = sign (MYK9-550, already correct)', () => {
    expect(redactSecretLikeString('Authorization: Bearer eyJhbGciOi.eyJzdWIiOi.SflKxwRJSM')).toBe(
      'Authorization: Bearer [redacted]'
    );
  });

  it('redacts Stripe restricted keys rk_live_ and rk_test_ (MYK9-550)', () => {
    expect(redactSecretLikeString('rk_live_abcdefgh12345678')).toBe('[redacted-secret]');
    expect(redactSecretLikeString('rk_test_abcdefgh12345678')).toBe('[redacted-secret]');
  });
});

describe('redactSecretLikeValue', () => {
  it('scrubs strings but passes through primitive diagnostic values', () => {
    expect(redactSecretLikeValue('sk_test_abcdefgh12345678')).toBe('[redacted-secret]');
    expect(redactSecretLikeValue(42)).toBe(42);
    expect(redactSecretLikeValue(false)).toBe(false);
    expect(redactSecretLikeValue(null)).toBeNull();
  });
});
