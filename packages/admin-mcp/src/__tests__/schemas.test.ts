import { describe, expect, it } from 'vitest';

import type { AdminMcpConfig } from '../config';
import {
  diagnosePaymentInput,
  makeLimitSchema,
  searchStringSchema,
  uuidSchema,
} from '../tools/schemas';

const CONFIG: AdminMcpConfig = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseServiceRoleKey: 'service-role-key',
  appBaseUrl: 'https://app.myk9show.com',
  envLabel: 'staging',
  defaultLimit: 25,
  maxLimit: 50,
};

const VALID_UUID = '11111111-2222-4333-8444-555555555555';

describe('uuidSchema', () => {
  it('accepts a UUID-shaped string and trims surrounding whitespace', () => {
    expect(uuidSchema.parse(`  ${VALID_UUID}  `)).toBe(VALID_UUID);
  });

  it('rejects a non-UUID string', () => {
    expect(() => uuidSchema.parse('not-a-uuid')).toThrow();
  });
});

describe('searchStringSchema', () => {
  it('trims and accepts a non-empty string', () => {
    expect(searchStringSchema.parse('  Springfield  ')).toBe('Springfield');
  });

  it('rejects an empty or whitespace-only string', () => {
    expect(() => searchStringSchema.parse('   ')).toThrow();
  });
});

describe('makeLimitSchema', () => {
  const limit = makeLimitSchema(CONFIG);

  it('defaults to the configured default limit when omitted', () => {
    expect(limit.parse(undefined)).toBe(25);
  });

  it('clamps a request above the max down to the configured max', () => {
    expect(limit.parse(500)).toBe(50);
  });

  it('passes through an in-range value', () => {
    expect(limit.parse(10)).toBe(10);
  });

  it('rejects a non-positive limit', () => {
    expect(() => limit.parse(0)).toThrow();
    expect(() => limit.parse(-3)).toThrow();
  });
});

describe('diagnosePaymentInput', () => {
  it('accepts when exactly one identifier is provided', () => {
    expect(diagnosePaymentInput.parse({ entryId: VALID_UUID })).toMatchObject({
      entryId: VALID_UUID,
    });
    expect(
      diagnosePaymentInput.parse({ paymentIntentId: 'pi_123' }),
    ).toMatchObject({ paymentIntentId: 'pi_123' });
  });

  it('rejects when no identifier is provided', () => {
    expect(() => diagnosePaymentInput.parse({})).toThrow();
  });
});
