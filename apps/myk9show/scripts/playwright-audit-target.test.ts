import { describe, expect, it } from 'vitest';
import { resolveAuditTarget, verifyAuditServerIdentity } from './playwright-audit-target';

describe('resolveAuditTarget', () => {
  it('accepts an explicitly identified loopback server and intercepted staging target', () => {
    expect(
      resolveAuditTarget({
        PLAYWRIGHT_AUDIT_BASE_URL: 'http://127.0.0.1:5173',
        PLAYWRIGHT_AUDIT_SERVER_ID: 'judge-walk-2026-08-01',
        PLAYWRIGHT_AUDIT_DATA_TARGET: 'shared-staging-intercepted',
        VITE_SUPABASE_URL: 'https://sojmvhhwsjxmfistvzbe.supabase.co',
      })
    ).toEqual({
      baseURL: 'http://127.0.0.1:5173',
      serverId: 'judge-walk-2026-08-01',
      dataTarget: 'shared-staging-intercepted',
    });
  });

  it.each([
    ['missing server identity', { PLAYWRIGHT_AUDIT_SERVER_ID: undefined }],
    ['non-loopback app URL', { PLAYWRIGHT_AUDIT_BASE_URL: 'https://example.com' }],
    ['ambiguous data target', { PLAYWRIGHT_AUDIT_DATA_TARGET: undefined }],
    ['unexpected Supabase target', { VITE_SUPABASE_URL: 'https://example.supabase.co' }],
  ])('fails closed for %s', (_name, overrides) => {
    expect(() =>
      resolveAuditTarget({
        PLAYWRIGHT_AUDIT_BASE_URL: 'http://127.0.0.1:5173',
        PLAYWRIGHT_AUDIT_SERVER_ID: 'judge-walk-2026-08-01',
        PLAYWRIGHT_AUDIT_DATA_TARGET: 'shared-staging-intercepted',
        VITE_SUPABASE_URL: 'https://sojmvhhwsjxmfistvzbe.supabase.co',
        ...overrides,
      })
    ).toThrow();
  });
});

describe('verifyAuditServerIdentity', () => {
  it('rejects a server that does not return the expected audit identity', () => {
    expect(() =>
      verifyAuditServerIdentity(
        { app: 'myk9show', serverId: 'different-server' },
        'judge-walk-2026-08-01'
      )
    ).toThrow(/identity/i);
  });
});
