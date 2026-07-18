import { describe, expect, it } from 'vitest';

import {
  LOCAL_E2E_PROJECT_REF,
  SHARED_STAGING_PROJECT_REF,
  resolveIsolatedE2eTarget,
} from './isolated-e2e-target';

const localConfig = {
  MYK9_PLAYWRIGHT_REGRESSION_ENABLED: 'true',
  MYK9_PLAYWRIGHT_REGRESSION_TARGET: 'isolated',
  MYK9_E2E_APPROVED_PROJECT_REFS: LOCAL_E2E_PROJECT_REF,
  MYK9_E2E_SUPABASE_PROJECT_REF: LOCAL_E2E_PROJECT_REF,
  MYK9_E2E_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_ANON_KEY: 'local-anon-key',
} satisfies NodeJS.ProcessEnv;

describe('resolveIsolatedE2eTarget', () => {
  it('accepts the disposable local target', () => {
    expect(resolveIsolatedE2eTarget(localConfig)).toEqual({
      projectRef: LOCAL_E2E_PROJECT_REF,
      supabaseUrl: 'http://127.0.0.1:54321',
      isLocal: true,
    });
  });

  it('rejects the shared staging project ref and host', () => {
    expect(() =>
      resolveIsolatedE2eTarget({
        ...localConfig,
        MYK9_E2E_APPROVED_PROJECT_REFS: SHARED_STAGING_PROJECT_REF,
        MYK9_E2E_SUPABASE_PROJECT_REF: SHARED_STAGING_PROJECT_REF,
        MYK9_E2E_SUPABASE_URL: `https://${SHARED_STAGING_PROJECT_REF}.supabase.co`,
        VITE_SUPABASE_URL: `https://${SHARED_STAGING_PROJECT_REF}.supabase.co`,
      })
    ).toThrow('Shared staging');
  });

  it('rejects an app build URL that differs from the target URL', () => {
    expect(() =>
      resolveIsolatedE2eTarget({
        ...localConfig,
        VITE_SUPABASE_URL: 'http://localhost:54321',
      })
    ).toThrow('does not match');
  });

  it('rejects missing and malformed target configuration', () => {
    const missing = { ...localConfig };
    delete missing.MYK9_E2E_SUPABASE_PROJECT_REF;
    expect(() => resolveIsolatedE2eTarget(missing)).toThrow('MYK9_E2E_SUPABASE_PROJECT_REF');

    expect(() =>
      resolveIsolatedE2eTarget({
        ...localConfig,
        MYK9_E2E_SUPABASE_URL: 'not-a-url',
      })
    ).toThrow('Invalid isolated E2E URL');
  });

  it('rejects a remote project ref until a separately approved target contract exists', () => {
    expect(() =>
      resolveIsolatedE2eTarget({
        ...localConfig,
        MYK9_E2E_APPROVED_PROJECT_REFS: 'isolated-e2e-project',
        MYK9_E2E_SUPABASE_PROJECT_REF: 'isolated-e2e-project',
        MYK9_E2E_SUPABASE_URL: 'https://isolated-e2e-project.supabase.co',
        VITE_SUPABASE_URL: 'https://isolated-e2e-project.supabase.co',
      })
    ).toThrow('Only the disposable local E2E target is supported');
  });

  it('does not include secret values in target errors', () => {
    const secret = 'super-secret-anon-key';
    try {
      resolveIsolatedE2eTarget({
        ...localConfig,
        VITE_SUPABASE_ANON_KEY: secret,
        MYK9_E2E_SUPABASE_URL: 'https://wrong.example.test',
      });
      throw new Error('Expected target verification to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(secret);
    }
  });
});
