import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { createRealGitFixture, runBootstrapAt } from './bootstrap-worktree-test-helpers';

const bootstrapScript = resolve(process.cwd(), 'scripts/bootstrap-worktree.sh');

interface BootstrapResult {
  error?: Error;
  status: number | null;
  stderr: string;
  stdout: string;
}

interface Fixture {
  root: string;
  primary: string;
  linked: string;
  bin: string;
  inventoryFile: string;
  gitLogFile: string;
  gitDir: string;
}

function createFixture(extraCount: number): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'myk9 bootstrap regression '));
  const primary = join(root, 'primary checkout\nwith newline');
  const linked = join(root, 'linked worktree');
  const bin = join(root, 'bin');
  const inventoryFile = join(root, 'inventory.txt');
  const gitLogFile = join(root, 'git.log');
  const gitDir = join(root, 'linked git dir');

  for (const directory of [primary, linked, bin, gitDir]) {
    execFileSync('mkdir', ['-p', directory]);
  }
  execFileSync('mkdir', ['-p', join(linked, '.githooks')]);
  execFileSync('mkdir', ['-p', join(primary, '.git')]);
  writeFileSync(join(gitDir, 'config.worktree'), '');
  writeFileSync(join(primary, '.git/config.worktree'), '');
  execFileSync('mkdir', ['-p', join(linked, 'apps/myk9show/node_modules/.bin')]);
  writeFileSync(join(linked, 'apps/myk9show/node_modules/.bin/vite'), '#!/bin/sh\n');
  chmodSync(join(linked, 'apps/myk9show/node_modules/.bin/vite'), 0o755);
  writeFileSync(inventoryFile, inventory(primary, extraCount));

  writeFileSync(
    join(bin, 'git'),
    `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$MYK9_BOOTSTRAP_GIT_LOG"
if [ "$1" = "rev-parse" ] && [ "$2" = "--show-toplevel" ]; then
  printf '%s\\n' "$MYK9_BOOTSTRAP_LINKED"
  exit 0
fi
if [ "$1" = "worktree" ] && [ "$2" = "list" ]; then
  if [ "$MYK9_BOOTSTRAP_GIT_FAILURE" = "1" ]; then
    printf '%s\\n' 'fatal: synthetic inventory failure' >&2
    exit 23
  fi
  cat "$MYK9_BOOTSTRAP_INVENTORY"
  exit 0
fi
if [ "$1" = "rev-parse" ] && [ "$2" = "--path-format=absolute" ]; then
  printf '%s\\n' "$MYK9_BOOTSTRAP_GIT_DIR"
  exit 0
fi
  if [ "$1" = "config" ]; then
  if [ "$2" = "--file" ] && [ "$4" = "--get" ] && [ "$5" = "extensions.worktreeConfig" ]; then
    if [ "$MYK9_BOOTSTRAP_WORKTREE_CONFIG" = "true" ]; then
      printf '%s\\n' 'true'
    fi
    exit 0
  fi
  if [ "$2" = "--get" ] && [ "$3" = "extensions.worktreeConfig" ]; then
    printf '%s\\n' 'true'
  fi
  exit 0
fi
printf 'unexpected synthetic git invocation: %s\\n' "$*" >&2
exit 24
`,
    { mode: 0o755 }
  );
  writeFileSync(join(bin, 'pnpm'), "#!/bin/sh\nset -eu\nprintf 'synthetic pnpm build\\n' >&2\n", {
    mode: 0o755,
  });

  return { root, primary, linked, bin, inventoryFile, gitLogFile, gitDir };
}

function runBootstrap(
  fixture: Fixture,
  gitFailure = false,
  reportedWorktree = fixture.linked
): BootstrapResult {
  const result = spawnSync('bash', [bootstrapScript], {
    cwd: fixture.linked,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fixture.bin}:${process.env.PATH ?? ''}`,
      MYK9_BOOTSTRAP_LINKED: reportedWorktree,
      MYK9_BOOTSTRAP_INVENTORY: fixture.inventoryFile,
      MYK9_BOOTSTRAP_GIT_DIR: fixture.gitDir,
      MYK9_BOOTSTRAP_GIT_LOG: fixture.gitLogFile,
      MYK9_BOOTSTRAP_GIT_FAILURE: gitFailure ? '1' : '0',
      MYK9_BOOTSTRAP_WORKTREE_CONFIG: 'true',
    },
    timeout: 10_000,
  });
  return {
    error: result.error,
    status: result.status,
    stderr: String(result.stderr),
    stdout: String(result.stdout),
  };
}

function runBootstrapAfterReleasingLock(
  fixture: Fixture,
  lockPath: string
): Promise<{ result: BootstrapResult; waited: boolean }> {
  return new Promise(resolvePromise => {
    const child = spawn('bash', [bootstrapScript], {
      cwd: fixture.linked,
      env: {
        ...process.env,
        PATH: `${fixture.bin}:${process.env.PATH ?? ''}`,
        MYK9_BOOTSTRAP_LINKED: fixture.linked,
        MYK9_BOOTSTRAP_INVENTORY: fixture.inventoryFile,
        MYK9_BOOTSTRAP_GIT_DIR: fixture.gitDir,
        MYK9_BOOTSTRAP_GIT_LOG: fixture.gitLogFile,
        MYK9_BOOTSTRAP_GIT_FAILURE: '0',
        MYK9_BOOTSTRAP_WORKTREE_CONFIG: 'true',
      },
    });
    let stdout = '';
    let stderr = '';
    let waited = false;
    const timeoutId = setTimeout(() => child.kill('SIGKILL'), 10_000);
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (!waited && stderr.includes(`Waiting for Git config bootstrap lock: ${lockPath}`)) {
        waited = true;
        rmSync(lockPath, { recursive: true, force: true });
      }
    });
    child.on('error', error => {
      clearTimeout(timeoutId);
      resolvePromise({ result: { error, status: null, stderr, stdout }, waited });
    });
    child.on('close', status => {
      clearTimeout(timeoutId);
      resolvePromise({ result: { status, stderr, stdout }, waited });
    });
  });
}

function inventory(primary: string, extraCount: number): string {
  const entries = [`worktree ${primary}`, 'HEAD abc123', 'branch refs/heads/main', '', ''];
  for (let index = 0; index < extraCount; index += 1) {
    entries.push(
      `worktree /tmp/synthetic linked worktree ${index.toString().padStart(5, '0')}`,
      `HEAD ${index.toString(16).padStart(40, '0')}`,
      `branch refs/heads/synthetic-${index}`,
      '',
      ''
    );
  }
  return `${entries.join('\0')}\0`;
}

describe('bootstrap-worktree worktree inventory handling', () => {
  it('selects the same spaced primary path for small and large inventories', () => {
    const fixture = createFixture(0);
    try {
      const small = runBootstrap(fixture);
      writeFileSync(fixture.inventoryFile, inventory(fixture.primary, 5_000));
      const large = runBootstrap(fixture);
      const results = [small, large];
      for (const result of results) {
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(0);
        expect(result.stderr).toContain(`Main repo: ${fixture.primary}`);
        expect(result.stderr).toContain('Git hooks activated');
      }
      const log = readFileSync(fixture.gitLogFile, 'utf8');
      expect(log).toContain('worktree list --porcelain -z');
      expect(log).toContain(
        `config --file ${fixture.gitDir}/config --get extensions.worktreeConfig`
      );
      expect(log).not.toContain(`config --file ${fixture.gitDir}/config core.hooksPath .githooks`);
      expect(log).toContain(
        `config --file ${fixture.gitDir}/config.worktree core.hooksPath .githooks`
      );
      expect(log).toContain(
        `config --file ${fixture.primary}/.git/config.worktree core.hooksPath .githooks`
      );
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('preserves a real git inventory failure and reports its diagnostic', () => {
    const fixture = createFixture(0);
    try {
      const result = runBootstrap(fixture, true);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(23);
      expect(result.stderr).toContain('fatal: synthetic inventory failure');
      expect(result.stderr).not.toContain('=== Bootstrapping worktree ===');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('fails closed when Git succeeds without a primary worktree record', () => {
    const fixture = createFixture(0);
    writeFileSync(fixture.inventoryFile, 'HEAD abc123\0branch refs/heads/main\0\0');
    try {
      const result = runBootstrap(fixture);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Failed to identify primary Git worktree');
      expect(result.stderr).not.toContain('=== Bootstrapping worktree ===');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('rejects a relative primary path before changing hook configuration', () => {
    const fixture = createFixture(0);
    writeFileSync(fixture.inventoryFile, inventory('relative/primary', 0));
    try {
      const result = runBootstrap(fixture);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('non-absolute primary worktree path');
      expect(result.stderr).not.toContain('Git hooks activated');
      expect(readFileSync(fixture.gitLogFile, 'utf8')).not.toContain('core.hooksPath');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('rejects a relative current worktree before reading inventory or changing config', () => {
    const fixture = createFixture(0);
    try {
      const result = runBootstrap(fixture, false, 'relative/worktree');
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('non-absolute path: relative/worktree');
      expect(readFileSync(fixture.gitLogFile, 'utf8')).not.toContain('worktree list');
      expect(readFileSync(fixture.gitLogFile, 'utf8')).not.toContain('core.hooksPath');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('fails immediately when the config lock path cannot be created', () => {
    const fixture = createFixture(0);
    writeFileSync(`${fixture.gitDir}/config.bootstrap.lock`, 'occupied by a file');
    try {
      const result = runBootstrap(fixture);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Cannot create Git config bootstrap lock');
      expect(readFileSync(fixture.gitLogFile, 'utf8')).not.toContain('core.hooksPath');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('reports manual recovery steps after an abandoned config lock times out', () => {
    const fixture = createFixture(0);
    const lockPath = `${fixture.gitDir}/config.bootstrap.lock`;
    execFileSync('mkdir', ['-p', lockPath]);
    writeFileSync(`${lockPath}/pid`, '424242\n');
    writeFileSync(join(fixture.bin, 'sleep'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    try {
      const result = runBootstrap(fixture);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`Lock owner marker: ${lockPath}/pid`);
      expect(result.stderr).toContain('After confirming no bootstrap is active');
      const shellQuotedLockPath = execFileSync('bash', ['-c', 'printf %q "$1"', 'bash', lockPath], {
        encoding: 'utf8',
      });
      expect(result.stderr).toContain(`rm -rf -- ${shellQuotedLockPath}`);
      expect(readFileSync(fixture.gitLogFile, 'utf8')).not.toContain('core.hooksPath');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('waits for an existing bootstrap lock before updating Git config', async () => {
    const fixture = createFixture(0);
    const lockPath = `${fixture.gitDir}/config.bootstrap.lock`;
    execFileSync('mkdir', ['-p', lockPath]);
    writeFileSync(`${lockPath}/pid`, '424242\n');
    try {
      const { result, waited } = await runBootstrapAfterReleasingLock(fixture, lockPath);
      expect(waited).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stderr).toContain('Git hooks activated');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('serializes simultaneous bootstrap hook writes', async () => {
    const fixture = createRealGitFixture();
    try {
      expect(
        spawnSync('git', [
          'config',
          '--file',
          join(fixture.primary, '.git/config'),
          '--get',
          'core.hooksPath',
        ]).status
      ).toBe(1);
      const results = await Promise.all(
        fixture.worktrees.map((worktree, index) =>
          runBootstrapAt(
            worktree,
            fixture.bin,
            fixture.globalConfig,
            fixture.worktrees[index === 0 ? 1 : 0]
          )
        )
      );
      for (const result of results) {
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(0);
        expect(result.stderr).toContain('Git hooks activated');
      }
      for (const checkout of [fixture.primary, ...fixture.worktrees]) {
        expect(
          execFileSync('git', ['-C', checkout, 'config', '--get', 'core.hooksPath'], {
            encoding: 'utf8',
            env: {
              ...process.env,
              GIT_CONFIG_GLOBAL: fixture.globalConfig,
              GIT_CONFIG_NOSYSTEM: '1',
            },
          }).trim()
        ).toBe('.githooks');
      }
      expect(
        spawnSync('git', [
          'config',
          '--file',
          join(fixture.primary, '.git/config'),
          '--get',
          'core.hooksPath',
        ]).status
      ).toBe(1);
      expect(
        execFileSync('git', ['config', '--global', '--get', 'core.hooksPath'], {
          encoding: 'utf8',
          env: {
            ...process.env,
            GIT_CONFIG_GLOBAL: fixture.globalConfig,
            GIT_CONFIG_NOSYSTEM: '1',
          },
        }).trim()
      ).toBe('/global/hooks');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
  it('ignores a global worktreeConfig setting when selecting repo config mode', async () => {
    const fixture = createRealGitFixture({
      localWorktreeConfig: false,
      globalWorktreeConfig: true,
    });
    try {
      const result = await runBootstrapAt(
        fixture.worktrees[0],
        fixture.bin,
        fixture.globalConfig,
        fixture.worktrees[1]
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      for (const checkout of fixture.worktrees) {
        expect(
          execFileSync('git', ['-C', checkout, 'config', '--get', 'core.hooksPath'], {
            encoding: 'utf8',
            env: {
              ...process.env,
              GIT_CONFIG_GLOBAL: fixture.globalConfig,
              GIT_CONFIG_NOSYSTEM: '1',
            },
          }).trim()
        ).toBe('.githooks');
      }
      expect(
        execFileSync(
          'git',
          ['config', '--file', join(fixture.primary, '.git/config'), '--get', 'core.hooksPath'],
          { encoding: 'utf8' }
        ).trim()
      ).toBe('.githooks');
      expect(
        spawnSync('git', [
          'config',
          '--file',
          join(fixture.primary, '.git/config'),
          '--get',
          'extensions.worktreeConfig',
        ]).status
      ).toBe(1);
      expect(
        execFileSync('git', ['config', '--global', '--get', 'extensions.worktreeConfig'], {
          encoding: 'utf8',
          env: {
            ...process.env,
            GIT_CONFIG_GLOBAL: fixture.globalConfig,
            GIT_CONFIG_NOSYSTEM: '1',
          },
        }).trim()
      ).toBe('true');
      expect(
        execFileSync('git', ['config', '--global', '--get', 'core.hooksPath'], {
          encoding: 'utf8',
          env: {
            ...process.env,
            GIT_CONFIG_GLOBAL: fixture.globalConfig,
            GIT_CONFIG_NOSYSTEM: '1',
          },
        }).trim()
      ).toBe('/global/hooks');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});

describe('bootstrap-worktree implementation guard', () => {
  it('reads all porcelain output without a short-lived head pipeline', () => {
    const source = readFileSync(bootstrapScript, 'utf8');
    expect(source).not.toContain('git worktree list --porcelain | head');
    expect(source).toContain('git worktree list --porcelain -z');
    expect(source).toContain("while IFS= read -r -d '' record");
  });
});
