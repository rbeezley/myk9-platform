import { describe, expect, it } from 'vitest';

import {
  resolveAuthPreflightConfig,
  verifyE2EAuthCredentials,
} from './e2eAuthPreflight';

describe('e2e auth preflight', () => {
  const baseEnv = {
    VITE_SUPABASE_URL: 'https://project.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'anon-key',
    E2E_SECRETARY_EMAIL: 'secretary@example.com',
    E2E_SECRETARY_PASSWORD: 'secret-password',
    E2E_ADMIN_EMAIL: 'admin@example.com',
    E2E_ADMIN_PASSWORD: 'admin-password',
  };

  it('resolves role credentials from env', () => {
    const config = resolveAuthPreflightConfig(baseEnv, ['secretary', 'admin']);

    expect(config.credentials).toEqual([
      {
        role: 'secretary',
        email: 'secretary@example.com',
        password: 'secret-password',
      },
      {
        role: 'admin',
        email: 'admin@example.com',
        password: 'admin-password',
      },
    ]);
  });

  it('names the missing role secret instead of letting Playwright time out', () => {
    expect(() =>
      resolveAuthPreflightConfig(
        {
          ...baseEnv,
          E2E_SECRETARY_PASSWORD: '',
        },
        ['secretary']
      )
    ).toThrow('Missing E2E auth preflight secret(s) for secretary: E2E_SECRETARY_PASSWORD');
  });

  it('posts a password-grant probe for each configured role', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ access_token: 'token' }), { status: 200 });
    };

    await verifyE2EAuthCredentials(resolveAuthPreflightConfig(baseEnv, ['secretary']), fetchImpl);

    expect(requests).toEqual([
      {
        url: 'https://project.supabase.co/auth/v1/token?grant_type=password',
        init: {
          method: 'POST',
          headers: {
            apikey: 'anon-key',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: 'secretary@example.com',
            password: 'secret-password',
          }),
        },
      },
    ]);
  });

  it('fails with a role-specific action message when Supabase rejects credentials', async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ error_description: 'Invalid login credentials' }), {
        status: 400,
      });

    await expect(
      verifyE2EAuthCredentials(resolveAuthPreflightConfig(baseEnv, ['secretary']), fetchImpl)
    ).rejects.toThrow(
      'E2E auth preflight failed for secretary: Supabase rejected the configured credentials (HTTP 400). Refresh E2E_SECRETARY_EMAIL/E2E_SECRETARY_PASSWORD and reset the Supabase auth user password.'
    );
  });

  it('accepts only supported role names', () => {
    expect(() => resolveAuthPreflightConfig(baseEnv, ['secretary', 'unknown'])).toThrow(
      'Unsupported E2E auth preflight role: unknown'
    );
  });
});
