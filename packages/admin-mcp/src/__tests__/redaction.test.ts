import { describe, expect, it } from 'vitest';

import {
  redactEmail,
  redactEvidenceValue,
  redactSensitive,
  shortenProviderId,
} from '../diagnostics/redaction';

describe('redactEmail', () => {
  it('masks the local part to a single initial', () => {
    expect(redactEmail('handler@example.com')).toBe('h***@example.com');
  });

  it('returns null for empty or malformed input', () => {
    expect(redactEmail(null)).toBeNull();
    expect(redactEmail(undefined)).toBeNull();
    expect(redactEmail('   ')).toBeNull();
    expect(redactEmail('not-an-email')).toBeNull();
    expect(redactEmail('@example.com')).toBeNull();
  });
});

describe('shortenProviderId', () => {
  it('keeps the type prefix and last four characters', () => {
    expect(shortenProviderId('pi_3NabcdefXyZ9')).toBe('pi_…XyZ9');
    expect(shortenProviderId('cs_test_a1b2c3d4WXYZ')).toBe('cs_…WXYZ');
  });

  it('collapses to the prefix when too short to mask safely', () => {
    expect(shortenProviderId('pi_12')).toBe('pi_…');
  });

  it('returns null for empty input', () => {
    expect(shortenProviderId(null)).toBeNull();
    expect(shortenProviderId('')).toBeNull();
  });
});

describe('redactSensitive', () => {
  it('redacts a service-role / JWT-looking token', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abcDEF123456';
    const out = redactSensitive(`raw ${jwt}`);
    expect(out).not.toContain(jwt);
    expect(out).toContain('[redacted-token]');
  });

  it('redacts Stripe secret and webhook signing keys', () => {
    expect(redactSensitive('sk_live_abcdefgh12345678')).toBe('[redacted-secret]');
    expect(redactSensitive('whsec_abcdefgh12345678')).toBe('[redacted-secret]');
  });

  it('redacts full Stripe checkout URLs', () => {
    const url = 'https://checkout.stripe.com/c/pay/cs_test_a1b2c3#fidSecret';
    const out = redactSensitive(`see ${url}`);
    expect(out).not.toContain('cs_test_a1b2c3');
    expect(out).toContain('[redacted-url]');
  });

  it('leaves ordinary values untouched', () => {
    expect(redactSensitive('open')).toBe('open');
  });
});

describe('redactEvidenceValue', () => {
  it('scrubs strings but passes through numbers, booleans, and null', () => {
    expect(redactEvidenceValue('sk_live_abcdefgh12345678')).toBe('[redacted-secret]');
    expect(redactEvidenceValue(42)).toBe(42);
    expect(redactEvidenceValue(true)).toBe(true);
    expect(redactEvidenceValue(null)).toBeNull();
  });
});
