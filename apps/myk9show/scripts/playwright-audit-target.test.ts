import { describe, expect, it } from 'vitest';
import {
  resolveAuditTarget,
  SHARED_STAGING_SUPABASE_HOST,
  verifyAuditServerIdentity,
} from './playwright-audit-target';

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

describe('verifyAuditServerIdentity — Supabase target', () => {
  const identity = (supabaseHost: unknown) => ({
    app: 'myk9show',
    serverId: 'judge-walk-2026-08-01',
    supabaseHost,
  });

  it('accepts a server pointed at the declared shared staging project', () => {
    expect(() =>
      verifyAuditServerIdentity(
        identity(SHARED_STAGING_SUPABASE_HOST),
        'judge-walk-2026-08-01',
        SHARED_STAGING_SUPABASE_HOST
      )
    ).not.toThrow();
  });

  it('rejects a server pointed at a different Supabase project', () => {
    // The write guard only recognises the declared host, so attaching here would
    // forward every write to that other project while reporting interception.
    expect(() =>
      verifyAuditServerIdentity(
        identity('some-other-project.supabase.co'),
        'judge-walk-2026-08-01',
        SHARED_STAGING_SUPABASE_HOST
      )
    ).toThrow(/some-other-project\.supabase\.co/);
  });

  it('rejects a server that reports no Supabase target at all', () => {
    expect(() =>
      verifyAuditServerIdentity(identity(null), 'judge-walk-2026-08-01', SHARED_STAGING_SUPABASE_HOST)
    ).toThrow(/Supabase host/);
  });

  it('skips the target check when no expectation is given', () => {
    // Keeps the original two-argument contract working for callers that only
    // care which server they reached.
    expect(() =>
      verifyAuditServerIdentity(identity(undefined), 'judge-walk-2026-08-01')
    ).not.toThrow();
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
