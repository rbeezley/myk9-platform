import { describe, expect, it } from 'vitest';

import {
  chooseRuntime,
  findStackIdForProjectRoot,
  formatSpecRunSummary,
  nativeStartArgs,
  nativeStatusToEnv,
  specRunEnv,
  stackDestroyArgs,
} from './isolated-e2e-native';
import { localSupabaseEnvironmentFromStatus } from './isolated-e2e-lifecycle';

const local = {
  apiUrl: 'http://127.0.0.1:54321',
  anonKey: 'anon-key',
  serviceRoleKey: 'service-role-key',
  dbUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
};

describe('chooseRuntime', () => {
  it('goes native when Docker is absent and docker when it is present', () => {
    expect(chooseRuntime({}, false)).toBe('native');
    expect(chooseRuntime({}, true)).toBe('docker');
  });

  it('lets MYK9_E2E_RUNTIME override detection and rejects other values', () => {
    expect(chooseRuntime({ MYK9_E2E_RUNTIME: 'native' }, true)).toBe('native');
    expect(chooseRuntime({ MYK9_E2E_RUNTIME: 'docker' }, false)).toBe('docker');
    expect(() => chooseRuntime({ MYK9_E2E_RUNTIME: 'podman' }, true)).toThrow(/native.*docker/);
  });
});

describe('native stack commands', () => {
  it('starts the native runtime with the native-compatible exclude list', () => {
    expect(nativeStartArgs()).toEqual([
      'start',
      '--runtime',
      'native',
      '--exclude',
      'studio,mail,analytics,pooler',
    ]);
  });

  it('destroys by a 12 character id prefix', () => {
    expect(stackDestroyArgs('a'.repeat(64))).toEqual([
      'stack',
      'destroy',
      '--stack-id',
      'a'.repeat(12),
      '--yes',
    ]);
  });

  it('reads the status JSON into the lifecycle environment', () => {
    const json = JSON.stringify({
      env: {
        API_URL: local.apiUrl,
        ANON_KEY: local.anonKey,
        SERVICE_ROLE_KEY: local.serviceRoleKey,
        DB_URL: local.dbUrl,
      },
    });
    expect(localSupabaseEnvironmentFromStatus(nativeStatusToEnv(json))).toEqual(local);
  });
});

describe('findStackIdForProjectRoot', () => {
  const list = JSON.stringify({
    stacks: [
      { id: 'aaa111aaa111bbb', project_root: '/repo/.claude/worktrees/other' },
      { id: 'ccc222ccc222ddd', project_root: '/repo/.claude/worktrees/mine' },
      { id: 'eee333eee333fff', project_root: '/repo/.claude/worktrees/mine-two' },
    ],
  });

  it('matches only the stack whose project_root is exactly this worktree', () => {
    expect(findStackIdForProjectRoot(list, '/repo/.claude/worktrees/mine')).toBe('ccc222ccc222ddd');
  });

  it('throws rather than guess when this worktree has no stack, or several', () => {
    expect(() => findStackIdForProjectRoot(list, '/repo/.claude/worktrees/none')).toThrow(
      /No native Supabase stack/
    );
    const twice = JSON.stringify({
      stacks: [
        { id: 'a', project_root: '/x' },
        { id: 'b', project_root: '/x' },
      ],
    });
    expect(() => findStackIdForProjectRoot(twice, '/x')).toThrow(/Several/);
  });
});

describe('spec run env', () => {
  it('carries the API URL and anon key but never the service key', () => {
    expect(specRunEnv(local)).toMatchObject({
      VITE_SUPABASE_URL: local.apiUrl,
      MYK9_E2E_SUPABASE_URL: local.apiUrl,
      VITE_SUPABASE_ANON_KEY: local.anonKey,
    });
    const printed = formatSpecRunSummary(local);
    expect(printed).toContain(local.anonKey);
    expect(printed).toContain('pnpm qa:isolated-e2e:run');
    expect(printed).not.toContain(local.serviceRoleKey);
    expect(printed).not.toContain(local.dbUrl);
    expect(JSON.stringify(specRunEnv(local))).not.toContain(local.serviceRoleKey);
  });
});
