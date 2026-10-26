/**
 * Local (Mac) compatibility for the cloud setup path (MYK9-1397;
 * docs/plan-cloud-agent-workflow.md, Global constraints protections 1-2).
 * setup.sh runs here against stub tools in a temporary repository whose
 * path contains a space, so every install, download and build it attempts is
 * recorded rather than performed.
 */
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
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const SETUP = join(HERE, 'setup.sh');

type Sandbox = { base: string; repo: string; home: string; stubs: string; callLog: string };

let sandbox: Sandbox;

function stub(name: string, body: string) {
  const path = join(sandbox.stubs, name);
  writeFileSync(path, `#!/usr/bin/env bash\necho "${name} $*" >> "$CALL_LOG"\n${body}\n`);
  chmodSync(path, 0o755);
}

function versionStub(name: string, output: string) {
  stub(name, `[ "$1" = "--version" ] && echo '${output}'; exit 0`);
}

beforeEach(() => {
  const base = mkdtempSync(join(tmpdir(), 'cloud setup '));
  const repo = join(base, 'AI Projects', 'myk9-platform');
  const home = join(base, 'home');
  const stubs = join(base, 'stubs');
  for (const dir of [join(repo, 'scripts', 'cloud'), home, stubs])
    mkdirSync(dir, { recursive: true });
  cpSync(join(HERE, 'tool-versions.json'), join(repo, 'scripts', 'cloud', 'tool-versions.json'));
  spawnSync('git', ['init', '-q', repo]);
  sandbox = { base, repo, home, stubs, callLog: join(base, 'calls.log') };
  writeFileSync(sandbox.callLog, '');

  stub(
    'uname',
    '[ "$1" = "-m" ] && echo "${STUB_UNAME_M:-x86_64}" || echo "${STUB_UNAME_S:-Linux}"'
  );
  versionStub('pnpm', '9.15.9');
  versionStub('gh', 'gh version 2.89.0 (2026-03-26)');
  versionStub('deno', 'deno 2.1.4 (stable)');
  versionStub('shellcheck', 'version: 0.10.0');
  for (const tool of ['curl', 'tar', 'unzip', 'install']) stub(tool, 'exit 0');
  // Every checksum fails, so a download that gets this far must stop.
  stub('sha256sum', 'exit 1');
});

afterEach(() => {
  rmSync(sandbox.base, { recursive: true, force: true });
});

function runSetup(env: Record<string, string>, args: string[] = []) {
  const result = spawnSync('bash', [SETUP, ...args], {
    cwd: sandbox.repo,
    encoding: 'utf8',
    env: {
      PATH: `${sandbox.stubs}:${dirname(process.execPath)}:/usr/bin:/bin`,
      HOME: sandbox.home,
      CALL_LOG: sandbox.callLog,
      ...env,
    },
  });
  const calls = readFileSync(sandbox.callLog, 'utf8')
    .split('\n')
    .filter(
      line =>
        line &&
        !/^(uname|pnpm --version|gh --version|deno --version|shellcheck --version)\b/.test(line)
    );
  return { ...result, calls };
}

const CLOUD = { CLAUDE_CODE_REMOTE: 'true' };

describe('scripts/cloud/setup.sh on a local machine', () => {
  it('refuses on macOS before installing or building anything, even with --force', () => {
    const result = runSetup({ ...CLOUD, STUB_UNAME_S: 'Darwin' }, ['--force']);
    expect(result.status).toBe(3);
    expect(result.stderr).toMatch(/refusing on macOS/);
    expect(result.calls).toEqual([]);
    expect(readdirSync(sandbox.home)).toEqual([]);
    expect(existsSync(join(sandbox.repo, '.cloud-tools'))).toBe(false);
  });

  it('refuses on Linux without a cloud marker', () => {
    const result = runSetup({});
    expect(result.status).toBe(3);
    expect(result.stderr).toMatch(/no cloud marker/);
    expect(result.calls).toEqual([]);
  });
});

describe('scripts/cloud/setup.sh in a cloud session', () => {
  it('builds and runs the preflight without touching HOME when the tools are present', () => {
    const result = runSetup(CLOUD, ['--role=reviewer']);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.calls).toEqual([
      'pnpm install --frozen-lockfile',
      'pnpm build --filter=./packages/*',
      'pnpm qa:dist-fresh',
      'pnpm run cloud:preflight --role=reviewer',
    ]);
    expect(readdirSync(sandbox.home)).toEqual([]);
  });

  it('direct setup and wrapped tasks use the same tools in a linked worktree', () => {
    const gitEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: '1' };
    expect(
      spawnSync(
        'git',
        [
          '-C',
          sandbox.repo,
          '-c',
          'user.name=Fixture',
          '-c',
          'user.email=fixture@example.invalid',
          'add',
          '.',
        ],
        { env: gitEnv }
      ).status
    ).toBe(0);
    expect(
      spawnSync(
        'git',
        [
          '-C',
          sandbox.repo,
          '-c',
          'user.name=Fixture',
          '-c',
          'user.email=fixture@example.invalid',
          'commit',
          '-qm',
          'fixture',
        ],
        { env: gitEnv }
      ).status
    ).toBe(0);
    const linked = join(sandbox.base, 'linked');
    expect(
      spawnSync('git', ['-C', sandbox.repo, 'worktree', 'add', '-qb', 'feature', linked], {
        env: gitEnv,
      }).status
    ).toBe(0);
    // The stub sees the exported setup destination without downloading anything.
    stub(
      'pnpm',
      '[ "$1" = "--version" ] && { echo 9.15.9; exit 0; }; echo "$MYK9_TOOLS_DIR" > "$TOOLS_RECEIPT"'
    );
    const receipt = join(sandbox.base, 'tools.txt');
    const env = {
      ...process.env,
      PATH: `${sandbox.stubs}:${dirname(process.execPath)}:/usr/bin:/bin`,
      HOME: sandbox.home,
      CLAUDE_CODE_REMOTE: 'true',
      MYK9_CLOUD_HOME: undefined,
      MYK9_TOOLS_DIR: undefined,
      CALL_LOG: sandbox.callLog,
      TOOLS_RECEIPT: receipt,
    };
    const setup = spawnSync('bash', [SETUP], {
      cwd: linked,
      env,
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect(setup.status, setup.stderr).toBe(0);
    const wrapped = spawnSync(
      'bash',
      [join(HERE, 'run.sh'), 'bash', '-c', 'printf "%s" "$MYK9_TOOLS_DIR"'],
      { cwd: linked, env, encoding: 'utf8', timeout: 10_000 }
    );
    expect(wrapped.status, wrapped.stderr).toBe(0);
    expect(wrapped.stdout).toBe(join(sandbox.repo, '.cloud-tools', 'bin'));
    expect(readFileSync(receipt, 'utf8').trim()).toBe(wrapped.stdout);
  }, 20_000);

  it('forwards a Claude reviewer selection to the preflight', () => {
    const result = runSetup(CLOUD, ['--role=reviewer', '--reviewer-harness=claude']);
    expect(result.status).toBe(0);
    expect(result.calls.at(-1)).toBe(
      'pnpm run cloud:preflight --role=reviewer --reviewer-harness=claude'
    );
  });

  it('rejects an unknown reviewer harness before installing anything', () => {
    const result = runSetup(CLOUD, ['--role=reviewer', '--reviewer-harness=gemini']);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/reviewer-harness/);
    expect(result.calls).toEqual([]);
  });

  it('stops on a checksum mismatch and installs nothing', () => {
    rmSync(join(sandbox.stubs, 'deno'));
    const result = runSetup(CLOUD);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/sha256 mismatch .*deno/);
    expect(result.calls.some(call => call.startsWith('curl '))).toBe(true);
    expect(result.calls.some(call => call.startsWith('install '))).toBe(false);
    expect(result.calls.some(call => call.startsWith('pnpm install'))).toBe(false);
  });

  it('never replaces Node or pnpm: a stale runtime fails before any download', () => {
    versionStub('pnpm', '8.15.0');
    const result = runSetup(CLOUD);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/pnpm 8\.15\.0 is below the pinned 9\.15\.9/);
    expect(result.calls).toEqual([]);
  });
});
