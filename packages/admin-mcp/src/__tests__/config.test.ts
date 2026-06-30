import { describe, expect, it } from 'vitest';

import { AdminMcpConfigError, loadAdminMcpConfig } from '../config';

const BASE_ENV: NodeJS.ProcessEnv = {
  MYK9_MCP_SUPABASE_URL: 'https://example.supabase.co',
  MYK9_MCP_SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  MYK9_MCP_APP_BASE_URL: 'https://app.myk9show.com/',
  MYK9_MCP_ENV_LABEL: 'staging',
};

function withoutKey(key: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...BASE_ENV };
  delete env[key];
  return env;
}

describe('loadAdminMcpConfig', () => {
  it('loads a valid config and trims trailing slashes from the app base URL', () => {
    const config = loadAdminMcpConfig({ ...BASE_ENV });

    expect(config.supabaseUrl).toBe('https://example.supabase.co');
    expect(config.appBaseUrl).toBe('https://app.myk9show.com');
    expect(config.envLabel).toBe('staging');
    expect(config.defaultLimit).toBeGreaterThan(0);
    expect(config.maxLimit).toBeLessThanOrEqual(100);
  });

  it.each([
    'MYK9_MCP_SUPABASE_URL',
    'MYK9_MCP_SUPABASE_SERVICE_ROLE_KEY',
    'MYK9_MCP_APP_BASE_URL',
    'MYK9_MCP_ENV_LABEL',
  ])('throws when %s is missing', (key) => {
    expect(() => loadAdminMcpConfig(withoutKey(key))).toThrow(AdminMcpConfigError);
  });

  it('rejects a Supabase URL that is not http(s)', () => {
    expect(() =>
      loadAdminMcpConfig({ ...BASE_ENV, MYK9_MCP_SUPABASE_URL: 'example.supabase.co' }),
    ).toThrow(AdminMcpConfigError);
  });

  it('rejects an env label outside local, staging, and production', () => {
    expect(() =>
      loadAdminMcpConfig({ ...BASE_ENV, MYK9_MCP_ENV_LABEL: 'prod' }),
    ).toThrow(/MYK9_MCP_ENV_LABEL/);
  });

  it('rejects a non-positive default limit', () => {
    expect(() =>
      loadAdminMcpConfig({ ...BASE_ENV, MYK9_MCP_DEFAULT_LIMIT: '0' }),
    ).toThrow(AdminMcpConfigError);
  });

  it('rejects a negative max limit', () => {
    expect(() =>
      loadAdminMcpConfig({ ...BASE_ENV, MYK9_MCP_MAX_LIMIT: '-5' }),
    ).toThrow(AdminMcpConfigError);
  });

  it('rejects a non-integer limit', () => {
    expect(() =>
      loadAdminMcpConfig({ ...BASE_ENV, MYK9_MCP_MAX_LIMIT: '12.5' }),
    ).toThrow(AdminMcpConfigError);
  });

  it('caps the max limit at the hard ceiling of 100', () => {
    const config = loadAdminMcpConfig({ ...BASE_ENV, MYK9_MCP_MAX_LIMIT: '500' });
    expect(config.maxLimit).toBe(100);
  });

  it('clamps the default limit down to the configured max limit', () => {
    const config = loadAdminMcpConfig({
      ...BASE_ENV,
      MYK9_MCP_MAX_LIMIT: '10',
      MYK9_MCP_DEFAULT_LIMIT: '50',
    });
    expect(config.defaultLimit).toBe(10);
  });
});
