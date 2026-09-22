import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

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
      expect(log).toContain('config --get extensions.worktreeConfig');
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
          execFileSync('git', ['-C', checkout, 'config', '--worktree', '--get', 'core.hooksPath'], {
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
});

function createRealGitFixture(): {
  root: string;
  primary: string;
  worktrees: string[];
  bin: string;
  globalConfig: string;
} {
  const root = mkdtempSync(join(tmpdir(), 'myk9 bootstrap concurrent real\n git '));
  const primary = join(root, 'primary\ncheckout');
  const worktrees = [join(root, 'worktree one'), join(root, 'worktree two')];
  const bin = join(root, 'bin');
  const globalConfig = join(root, 'global config');
  execFileSync('mkdir', ['-p', primary, bin]);
  writeFileSync(globalConfig, '[core]\n\thooksPath = /global/hooks\n');
  execFileSync('git', ['init', '-q', primary]);
  execFileSync('git', ['-C', primary, 'config', 'user.email', 'bootstrap-test@example.invalid']);
  execFileSync('git', ['-C', primary, 'config', 'user.name', 'Bootstrap Test']);
  execFileSync('git', ['-C', primary, 'config', 'extensions.worktreeConfig', 'true']);
  execFileSync('mkdir', ['-p', join(primary, '.githooks')]);
  writeFileSync(join(primary, '.githooks/pre-commit'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  execFileSync('git', ['-C', primary, 'add', '.githooks/pre-commit']);
  execFileSync('git', ['-C', primary, 'commit', '-qm', 'fixture']);
  for (const [index, worktree] of worktrees.entries()) {
    execFileSync('git', [
      '-C',
      primary,
      'worktree',
      'add',
      '-q',
      '-b',
      `bootstrap-${index}`,
      worktree,
      'HEAD',
    ]);
    execFileSync('mkdir', ['-p', join(worktree, 'apps/myk9show/node_modules/.bin')]);
    writeFileSync(join(worktree, 'apps/myk9show/node_modules/.bin/vite'), '#!/bin/sh\n', {
      mode: 0o755,
    });
  }
  writeFileSync(
    join(bin, 'pnpm'),
    `#!/bin/sh
if [ "$1" = "build" ]; then
  attempt=0
  while [ "$attempt" -lt 30 ]; do
    other_hooks="$(git -C "$MYK9_BOOTSTRAP_OTHER_WORKTREE" config --worktree --get core.hooksPath 2>/dev/null || true)"
    if [ "$other_hooks" = ".githooks" ]; then exit 0; fi
    attempt=$((attempt + 1))
    sleep 0.1
  done
  echo 'other bootstrap could not update config during build' >&2
  exit 1
fi
exit 0
`,
    { mode: 0o755 }
  );
  return { root, primary, worktrees, bin, globalConfig };
}

function runBootstrapAt(
  worktree: string,
  bin: string,
  globalConfig: string,
  otherWorktree: string
): Promise<BootstrapResult> {
  return new Promise(resolvePromise => {
    const child = spawn('bash', [bootstrapScript], {
      cwd: worktree,
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: globalConfig,
        GIT_CONFIG_NOSYSTEM: '1',
        MYK9_BOOTSTRAP_OTHER_WORKTREE: otherWorktree,
        PATH: `${bin}:${process.env.PATH ?? ''}`,
      },
    });
    let stdout = '';
    let stderr = '';
    const timeoutId = setTimeout(() => child.kill('SIGKILL'), 10_000);
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', error => {
      clearTimeout(timeoutId);
      resolvePromise({ error, status: null, stderr, stdout });
    });
    child.on('close', status => {
      clearTimeout(timeoutId);
      resolvePromise({ status, stderr, stdout });
    });
  });
}

describe('bootstrap-worktree implementation guard', () => {
  it('reads all porcelain output without a short-lived head pipeline', () => {
    const source = readFileSync(bootstrapScript, 'utf8');
    expect(source).not.toContain('git worktree list --porcelain | head');
    expect(source).toContain('git worktree list --porcelain -z');
    expect(source).toContain("while IFS= read -r -d '' record");
  });
});
