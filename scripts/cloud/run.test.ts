import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
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
    const base = mkdtempSync(join(tmpdir(), `cloud-run-${task.id}-`));
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
    env: { ...sandbox.env, MYK9_CLOUD: '1', ...env },
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

it('preserves writable defaults, config and warmed caches in fresh shells', ({ sandbox }) => {
  const config = join(sandbox.home, '.config');
  mkdirSync(join(config, 'git'), { recursive: true });
  writeFileSync(join(config, 'git', 'config'), '[user]\nname = Cloud Fixture\n');
  const corepack = join(sandbox.home, 'corepack');
  const browsers = join(sandbox.home, '.cache', 'ms-playwright');
  mkdirSync(corepack, { recursive: true });
  mkdirSync(browsers, { recursive: true });
  writeFileSync(join(corepack, 'prepared'), 'fixture');
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = run(sandbox, { COREPACK_HOME: corepack });
    expect(result.status, result.stderr).toBe(0);
    const env = JSON.parse(result.stdout);
    expect(env.COREPACK_HOME).toBe(corepack);
    for (const key of [
      'XDG_CONFIG_HOME',
      'XDG_CACHE_HOME',
      'XDG_DATA_HOME',
      'XDG_STATE_HOME',
      'PNPM_HOME',
      'DENO_DIR',
    ]) {
      expect(env[key], key).toBeUndefined();
    }
  }
  const identity = run(sandbox, {}, ['git', 'config', 'user.name']);
  expect(identity.stdout.trim()).toBe('Cloud Fixture');
  expect(readFileSync(join(corepack, 'prepared'), 'utf8')).toBe('fixture');
  expect(readdirSync(browsers)).toEqual([]);
});

it('redirects only unwritable tool, Corepack, pnpm and Deno paths', ({ sandbox }) => {
  const blocked = join(sandbox.base, 'blocked');
  mkdirSync(blocked);
  chmodSync(blocked, 0o555);
  const result = run(sandbox, {
    MYK9_TOOLS_DIR: blocked,
    COREPACK_HOME: blocked,
    PNPM_HOME: blocked,
    DENO_DIR: blocked,
    XDG_CONFIG_HOME: blocked,
    XDG_CACHE_HOME: blocked,
  });
  expect(result.status, result.stderr).toBe(0);
  const env = JSON.parse(result.stdout);
  const cloudHome = join(sandbox.repo, '.cloud-tools');
  expect(env.MYK9_TOOLS_DIR).toBe(join(cloudHome, 'bin'));
  expect(env.COREPACK_HOME).toBe(join(cloudHome, 'corepack'));
  expect(env.PNPM_HOME).toBe(join(cloudHome, 'pnpm'));
  expect(env.DENO_DIR).toBe(join(cloudHome, 'deno'));
  // Config/cache discovery is untouched even when read-only: no hidden logins/browsers.
  expect(env.XDG_CONFIG_HOME).toBe(blocked);
  expect(env.XDG_CACHE_HOME).toBe(blocked);
  expect(env.ASTRO_TELEMETRY_DISABLED).toBe('1');
});

it('uses explicit cloud storage without Git discovery outside a checkout', ({ sandbox }) => {
  const result = run(
    sandbox,
    { MYK9_CLOUD_HOME: join(sandbox.base, 'explicit') },
    undefined,
    sandbox.base
  );
  expect(result.status, result.stderr).toBe(0);
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
  const corepack = join(sandbox.base, 'unwritable corepack');
  mkdirSync(corepack);
  chmodSync(corepack, 0o555);
  const result = run(sandbox, { COREPACK_HOME: corepack }, [
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
  const runtimeShell = ['environment.sh', 'run.sh']
    .map(file => readFileSync(join(HERE, file), 'utf8'))
    .join('\n');
  const directOnly = new Set([
    'MYK9_CLOUD',
    'MYK9_CLOUD_HOME',
    'MYK9_TOOLS_DIR',
    'DENO_DIR',
    'PATH',
  ]);
  const runtimeKeys = [...runtimeShell.matchAll(/(?:myk9_writable_path|export) (\w+)/g)]
    .map(match => match[1]!)
    .filter(key => !directOnly.has(key));
  // Discover exports from both scripts: adding an export without a task allowance
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
