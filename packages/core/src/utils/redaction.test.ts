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
});

describe('redactSecretLikeValue', () => {
  it('scrubs strings but passes through primitive diagnostic values', () => {
    expect(redactSecretLikeValue('sk_test_abcdefgh12345678')).toBe('[redacted-secret]');
    expect(redactSecretLikeValue(42)).toBe(42);
    expect(redactSecretLikeValue(false)).toBe(false);
    expect(redactSecretLikeValue(null)).toBeNull();
  });
});
