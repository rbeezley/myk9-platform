import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUN = join(HERE, 'run.sh');
const TURBO = resolve(HERE, '../../node_modules/turbo/bin/turbo');
const ENV_KEYS = [
  'MYK9_CLOUD',
  'MYK9_TOOLS_DIR',
  'COREPACK_HOME',
  'PNPM_HOME',
  'XDG_CONFIG_HOME',
  'XDG_CACHE_HOME',
  'XDG_DATA_HOME',
  'XDG_STATE_HOME',
  'DENO_DIR',
  'NODE_OPTIONS',
  'ASTRO_TELEMETRY_DISABLED',
] as const;
const PROBE = `console.log(JSON.stringify(Object.fromEntries(${JSON.stringify(ENV_KEYS)}.map(key => [key, process.env[key]]))))`;

type Sandbox = { base: string; repo: string; home: string; env: NodeJS.ProcessEnv };

const it = test.extend<{ sandbox: Sandbox }>({
  sandbox: async ({ task }, use) => {
    const base = mkdtempSync(join(realpathSync(tmpdir()), `cloud-run-${task.id}-`));
    const repo = join(base, 'AI Projects', 'repo');
    const home = join(base, 'home');
    const stubs = join(base, 'stubs');
    for (const dir of [repo, home, stubs]) mkdirSync(dir, { recursive: true });
    writeFileSync(join(base, 'probe.cjs'), PROBE);
    writeFileSync(join(stubs, 'uname'), '#!/bin/sh\necho "${STUB_UNAME_S:-Linux}"\n');
    chmodSync(join(stubs, 'uname'), 0o755);
    const env = {
      // Keep executor runtime guards while removing prepared cloud settings.
      ...process.env,
      ...Object.fromEntries(ENV_KEYS.map(key => [key, undefined])),
      MYK9_CLOUD_HOME: undefined,
      CLAUDE_CODE_REMOTE: undefined,
      GITHUB_ACTIONS: undefined,
      PATH: `${stubs}:${dirname(process.execPath)}:/usr/bin:/bin`,
      HOME: home,
      TURBO_TELEMETRY_DISABLED: '1',
      DO_NOT_TRACK: '1',
    };
    const init = spawnSync('git', ['init', '-q', repo], { env });
    expect(init.status).toBe(0);
    const commit = spawnSync(
      'git',
      [
        '-C',
        repo,
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '--allow-empty',
        '-qm',
        'fixture',
      ],
      { env }
    );
    expect(commit.status).toBe(0);
    try {
      await use({ base, repo, home, env });
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  },
});

function run(
  sandbox: Sandbox,
  env: NodeJS.ProcessEnv = {},
  args = [process.execPath, join(sandbox.base, 'probe.cjs')],
  cwd = sandbox.repo
) {
  return spawnSync('bash', [RUN, ...args], {
    cwd,
    env: { ...sandbox.env, MYK9_CLOUD: '1', MYK9_CLOUD_HOME: '.cloud-tools', ...env },
    encoding: 'utf8',
    timeout: 10_000,
  });
}

it('refuses on macOS before creating tool/cache directories', ({ sandbox }) => {
  const result = run(sandbox, { STUB_UNAME_S: 'Darwin' });
  expect(result.status).toBe(3);
  expect(result.stderr).toMatch(/Linux/);
  expect(readdirSync(sandbox.repo)).toEqual(['.git']);
  expect(readdirSync(sandbox.home)).toEqual([]);
});

it('requires a cloud marker and a command before writing anything', ({ sandbox }) => {
  const unmarked = run(sandbox, { MYK9_CLOUD: '' });
  expect(unmarked.status).toBe(3);
  expect(unmarked.stderr).toMatch(/cloud marker/);
  const noCommand = run(sandbox, {}, []);
  expect(noCommand.status).toBe(2);
  expect(readdirSync(sandbox.repo)).toEqual(['.git']);
  expect(readdirSync(sandbox.home)).toEqual([]);
});

it('requires one cloud home and exports only its fixed runtime paths', ({ sandbox }) => {
  const missing = run(sandbox, { MYK9_CLOUD_HOME: '' });
  expect(missing.status).toBe(2);
  expect(missing.stderr).toMatch(/MYK9_CLOUD_HOME/);
  expect(readdirSync(sandbox.repo)).toEqual(['.git']);
  const root = join(sandbox.repo, '.cloud-tools');
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = run(sandbox, { COREPACK_HOME: '/ignored', MYK9_TOOLS_DIR: '/ignored' });
    expect(result.status, result.stderr).toBe(0);
    const env = JSON.parse(result.stdout);
    expect(env.MYK9_TOOLS_DIR).toBe(join(root, 'bin'));
    expect(env.COREPACK_HOME).toBe(join(root, 'corepack'));
    expect(env.PNPM_HOME).toBe(join(root, 'pnpm'));
    expect(env.DENO_DIR).toBe(join(root, 'deno'));
    for (const key of ['XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME'])
      expect(env[key]).toBeUndefined();
  }
  expect(readdirSync(sandbox.home)).toEqual([]);
});

it('fails loudly on a blocked fixed directory without selecting another path, even as root', ({
  sandbox,
}) => {
  const cloudHome = join(sandbox.repo, '.cloud-tools');
  mkdirSync(cloudHome);
  // A regular file blocks mkdir for all users, including root; no chmod assumption.
  writeFileSync(join(cloudHome, 'corepack'), 'blocked');
  const result = run(sandbox, {}, ['bash', '-c', 'echo SHOULD_NOT_RUN']);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/cloud run:.*COREPACK_HOME/);
  expect(result.stdout).not.toContain('SHOULD_NOT_RUN');
  expect(readFileSync(join(cloudHome, 'corepack'), 'utf8')).toBe('blocked');
});

it('shares prepared tools across linked worktrees and finds them on PATH', ({ sandbox }) => {
  const tools = join(sandbox.repo, '.cloud-tools', 'bin');
  mkdirSync(tools, { recursive: true });
  writeFileSync(join(tools, 'prepared-tool'), '#!/bin/sh\nprintf "%s" "$MYK9_TOOLS_DIR"\n');
  chmodSync(join(tools, 'prepared-tool'), 0o755);
  const worktree = join(sandbox.base, 'feature checkout');
  const added = spawnSync(
    'git',
    ['-C', sandbox.repo, 'worktree', 'add', '-qb', 'feature', worktree],
    { env: sandbox.env }
  );
  expect(added.status).toBe(0);
  const result = run(sandbox, {}, ['prepared-tool'], worktree);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toBe(tools);
});

it('uses one physical tools root when the caller reaches the repo through a symlink', ({
  sandbox,
}) => {
  const alias = join(sandbox.base, 'repo alias');
  symlinkSync(sandbox.repo, alias, 'dir');
  const result = run(sandbox, {}, undefined, alias);
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).MYK9_TOOLS_DIR).toBe(join(sandbox.repo, '.cloud-tools', 'bin'));
});

it('preserves TLS options and an explicitly chosen Node heap', ({ sandbox }) => {
  const tls = run(sandbox, { NODE_OPTIONS: '--use-openssl-ca' });
  expect(tls.status, tls.stderr).toBe(0);
  expect(JSON.parse(tls.stdout).NODE_OPTIONS).toBe('--use-openssl-ca --max-old-space-size=6144');
  const heap = run(sandbox, { NODE_OPTIONS: '--use-openssl-ca --max-old-space-size=2048' });
  expect(heap.status, heap.stderr).toBe(0);
  expect(JSON.parse(heap.stdout).NODE_OPTIONS).toBe('--use-openssl-ca --max-old-space-size=2048');
});

it('honors explicit cloud paths, preserves arguments and returns the child exit code', ({
  sandbox,
}) => {
  const cloudHome = join(sandbox.base, 'custom tools');
  const result = run(sandbox, { MYK9_CLOUD_HOME: cloudHome });
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).MYK9_TOOLS_DIR).toBe(join(cloudHome, 'bin'));
  const failure = join(sandbox.base, 'failure.cjs');
  writeFileSync(failure, 'console.log(process.argv[2]); process.exit(47);');
  const failed = run(sandbox, {}, [process.execPath, failure, 'argument with spaces']);
  expect(failed.stdout.trim()).toBe('argument with spaces');
  expect(failed.status).toBe(47);
});

it('passes cloud settings through the real Turbo process into docs typecheck', ({ sandbox }) => {
  const app = join(sandbox.repo, 'apps', 'docs');
  mkdirSync(app, { recursive: true });
  writeFileSync(
    join(sandbox.repo, 'package.json'),
    JSON.stringify({ name: 'fixture', private: true, packageManager: 'pnpm@9.15.9' })
  );
  writeFileSync(join(sandbox.repo, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n');
  writeFileSync(
    join(sandbox.repo, 'pnpm-lock.yaml'),
    "lockfileVersion: '9.0'\nimporters:\n  .: {}\n  apps/docs: {}\n"
  );
  writeFileSync(
    join(app, 'package.json'),
    JSON.stringify({
      name: '@myk9/docs',
      scripts: { typecheck: `"${process.execPath}" probe.cjs` },
    })
  );
  writeFileSync(
    join(app, 'probe.cjs'),
    `console.log('CLOUD_ENV=' + JSON.stringify({config: process.env.XDG_CONFIG_HOME, telemetry: process.env.ASTRO_TELEMETRY_DISABLED, heap: process.env.NODE_OPTIONS, corepack: process.env.COREPACK_HOME}));`
  );
  cpSync(resolve(HERE, '../../turbo.json'), join(sandbox.repo, 'turbo.json'));
  // Turbo invokes the package manager; this fixture runs only its local probe.
  const pnpm = join(sandbox.base, 'stubs', 'pnpm');
  writeFileSync(
    pnpm,
    '#!/usr/bin/env node\nconst {spawnSync} = require("node:child_process"); const result = spawnSync(process.execPath, ["probe.cjs"], {stdio: "inherit"}); process.exit(result.status ?? 1);\n'
  );
  chmodSync(pnpm, 0o755);
  const result = run(sandbox, {}, [
    process.execPath,
    TURBO,
    'run',
    'typecheck',
    '--filter=@myk9/docs',
    '--force',
  ]);
  expect(result.status, result.stderr).toBe(0);
  const output = result.stdout.match(/CLOUD_ENV=(\{[^\n]+\})/);
  expect(output, result.stdout).not.toBeNull();
  const configText = readFileSync(resolve(HERE, '../../turbo.json'), 'utf8').replace(
    /^\s*\/\/.*$/gm,
    ''
  );
  const config = JSON.parse(configText);
  expect(config.globalPassThroughEnv).toBeUndefined();
  const runtimeShell = readFileSync(RUN, 'utf8');
  const directOnly = new Set([
    'MYK9_CLOUD',
    'MYK9_CLOUD_HOME',
    'MYK9_TOOLS_DIR',
    'DENO_DIR',
    'PATH',
  ]);
  const runtimeKeys = [...runtimeShell.matchAll(/export (\w+)/g)]
    .map(match => match[1]!)
    .filter(key => !directOnly.has(key));
  // Discover exports from the wrapper: adding an export without a task allowance
  // fails here. The excluded names are direct cloud-command discovery only.
  for (const task of ['build', 'typecheck', 'lint', 'test', 'dev']) {
    expect(config.tasks[task].passThroughEnv).toEqual(
      expect.arrayContaining([...runtimeKeys, 'NODE_OPTIONS', 'ASTRO_TELEMETRY_DISABLED'])
    );
  }
  expect(JSON.parse(output![1]!)).toEqual({
    telemetry: '1',
    heap: '--max-old-space-size=6144',
    corepack: join(sandbox.repo, '.cloud-tools', 'corepack'),
  });
}, 20_000);
