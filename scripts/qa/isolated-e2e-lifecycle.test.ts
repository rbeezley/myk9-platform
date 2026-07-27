import { describe, expect, it } from 'vitest';

import {
  buildGithubEnvLines,
  buildJobEnvironment,
  formatLifecycleFailure,
  localSupabaseStartArgs,
  localSupabaseEnvironmentFromStatus,
  parseSupabaseStatusEnv,
  resolveSupabaseCliCommand,
} from './isolated-e2e-lifecycle';

const local = {
  apiUrl: 'http://127.0.0.1:54321',
  anonKey: 'anon-key',
  serviceRoleKey: 'service-role-key',
  dbUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
};

describe('parseSupabaseStatusEnv', () => {
  it('parses quoted status values without logging or altering embedded equals signs', () => {
    expect(
      parseSupabaseStatusEnv(
        ['API_URL="http://127.0.0.1:54321"', 'ANON_KEY="abc=="', 'IGNORED: value'].join('\n')
      )
    ).toEqual({
      API_URL: 'http://127.0.0.1:54321',
      ANON_KEY: 'abc==',
    });
  });
});

describe('localSupabaseEnvironmentFromStatus', () => {
  it('requires every generated local endpoint/key needed by the workflow', () => {
    expect(() => localSupabaseEnvironmentFromStatus('API_URL=http://127.0.0.1:54321')).toThrow(
      'SERVICE_ROLE_KEY'
    );

    expect(
      localSupabaseEnvironmentFromStatus(
        [
          'API_URL=http://127.0.0.1:54321',
          'ANON_KEY=anon-key',
          'SERVICE_ROLE_KEY=service-role-key',
          'DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        ].join('\n')
      )
    ).toEqual(local);
  });
});

describe('buildJobEnvironment', () => {
  it('points both the app and target contract at the same local API', () => {
    expect(buildJobEnvironment(local)).toMatchObject({
      MYK9_E2E_APPROVED_PROJECT_REFS: 'local',
      MYK9_E2E_SUPABASE_PROJECT_REF: 'local',
      MYK9_E2E_SUPABASE_URL: local.apiUrl,
      VITE_SUPABASE_URL: local.apiUrl,
      VITE_SUPABASE_ANON_KEY: local.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: local.serviceRoleKey,
      SUPABASE_DB_URL: local.dbUrl,
    });
  });

  it('writes generated values without labels that could be mistaken for staging', () => {
    const lines = buildGithubEnvLines(local);
    expect(lines).toContain('MYK9_E2E_SUPABASE_PROJECT_REF=local');
    expect(lines).toContain('VITE_SUPABASE_URL=http://127.0.0.1:54321');
    expect(lines).toContain('SUPABASE_SERVICE_ROLE_KEY=service-role-key');
    expect(lines).not.toContain('sojmvhhwsjxmfistvzbe');
  });
});

describe('lifecycle safety', () => {
  it('starts only the local services required by the curated browser suite', () => {
    expect(localSupabaseStartArgs()).toEqual([
      'start',
      '--exclude',
      'analytics,edge-runtime,functions,imgproxy,inbucket,meta,studio,vector',
    ]);
  });

  it('allows CI to select an explicit Supabase CLI binary', () => {
    expect(resolveSupabaseCliCommand({ SUPABASE_CLI_BIN: '/tmp/supabase' })).toBe('/tmp/supabase');
    expect(resolveSupabaseCliCommand({})).toBe('supabase');
  });

  it('uses a local project ref for every generated environment line', () => {
    const values = Object.fromEntries(
      buildGithubEnvLines(local)
        .trim()
        .split('\n')
        .map(line => line.split('='))
    );

    expect(values.MYK9_E2E_APPROVED_PROJECT_REFS).toBe('local');
    expect(values.MYK9_E2E_SUPABASE_PROJECT_REF).toBe('local');
  });

  it('does not put generated credentials into parser or assertion messages', () => {
    const output = 'API_URL="http://127.0.0.1:54321"\nSERVICE_ROLE_KEY="local-secret"';
    expect(() => localSupabaseEnvironmentFromStatus(output)).toThrow('ANON_KEY, DB_URL');
    expect(() => localSupabaseEnvironmentFromStatus(output)).not.toThrow('local-secret');
    expect(formatLifecycleFailure('Supabase start')).toBe('Supabase start failed');
    expect(formatLifecycleFailure('Supabase start')).not.toContain('local-secret');
  });

  it('keeps useful start diagnostics while redacting generated credentials', () => {
    const detail = [
      'container supabase_storage is unhealthy',
      'SERVICE_ROLE_KEY=local-service-role-secret',
      'DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    ].join('\n');

    const message = formatLifecycleFailure('Supabase start', detail);

    expect(message).toContain('container supabase_storage is unhealthy');
    expect(message).toContain('SERVICE_ROLE_KEY=[redacted]');
    expect(message).toContain('DB_URL=[redacted]');
    expect(message).not.toContain('local-service-role-secret');
    expect(message).not.toContain('postgres:postgres');
  });
});
