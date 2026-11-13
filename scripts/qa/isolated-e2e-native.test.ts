import { mkdtempSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildSpecEnv,
  chooseRuntime,
  findOptionalStackIdForProjectRoot,
  parseE2ePasswords,
  withPlaywrightDefaults,
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

  it('keeps Docker on CI even when docker info fails, so a sick daemon fails loudly', () => {
    expect(chooseRuntime({ CI: 'true' }, false)).toBe('docker');
    expect(chooseRuntime({ GITHUB_ACTIONS: 'true' }, false)).toBe('docker');
    expect(chooseRuntime({ CI: 'true', MYK9_E2E_RUNTIME: 'native' }, false)).toBe('native');
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

describe('stack lookup normalisation', () => {
  it('ignores a trailing slash and resolves symlinks, but never prefix-matches', () => {
    const base = mkdtempSync(join(tmpdir(), 'e2e-root-'));
    const real = join(base, 'real');
    mkdirSync(real);
    mkdirSync(join(real, 'child'));
    const link = join(base, 'link');
    symlinkSync(real, link);
    const list = JSON.stringify({
      stacks: [
        { id: 'real-stack', project_root: `${real}/` },
        { id: 'child-stack', project_root: join(real, 'child') },
      ],
    });
    expect(findOptionalStackIdForProjectRoot(list, real)).toBe('real-stack');
    expect(findOptionalStackIdForProjectRoot(list, link)).toBe('real-stack');
    expect(findOptionalStackIdForProjectRoot(list, `${real}/`)).toBe('real-stack');
    expect(findOptionalStackIdForProjectRoot(list, `${real}-x`)).toBeUndefined();
  });
});

describe('playwright arguments', () => {
  it('adds chromium and one worker only when the caller chose neither', () => {
    expect(withPlaywrightDefaults(['a.spec.ts'])).toEqual([
      'a.spec.ts',
      '--workers=1',
      '--project=chromium',
    ]);
    expect(withPlaywrightDefaults(['a.spec.ts', '--project=firefox', '--workers', '3'])).toEqual([
      'a.spec.ts',
      '--project=firefox',
      '--workers',
      '3',
    ]);
  });
});

describe('buildSpecEnv', () => {
  it('drops the service key and DB URL even when the shell or job env set them', () => {
    const env = buildSpecEnv({ SUPABASE_SERVICE_ROLE_KEY: 'from-shell', KEEP: 'yes' }, local, {
      SUPABASE_DB_URL: local.dbUrl,
      SUPABASE_SERVICE_ROLE_KEY: local.serviceRoleKey,
    });
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(env.SUPABASE_DB_URL).toBeUndefined();
    expect(env.KEEP).toBe('yes');
    expect(env.VITE_SUPABASE_URL).toBe(local.apiUrl);
  });
});

describe('parseE2ePasswords', () => {
  it('strips quotes and inline comments, keeps # inside quotes, skips keys the shell set', () => {
    const content = [
      'E2E_ADMIN_PASSWORD=plain # the admin',
      'E2E_JUDGE_PASSWORD="has # inside" # note',
      "E2E_SECRETARY_PASSWORD='quoted'",
      'E2E_DEMO_EXHIBITOR_PASSWORD=from-file',
      'OTHER=x',
    ].join('\n');
    expect(parseE2ePasswords(content, { E2E_DEMO_EXHIBITOR_PASSWORD: 'shell' })).toEqual({
      E2E_ADMIN_PASSWORD: 'plain',
      E2E_JUDGE_PASSWORD: 'has # inside',
      E2E_SECRETARY_PASSWORD: 'quoted',
    });
  });
});
