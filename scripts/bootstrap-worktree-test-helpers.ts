import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const bootstrapScript = resolve(process.cwd(), 'scripts/bootstrap-worktree.sh');

interface BootstrapResult {
  error?: Error;
  status: number | null;
  stderr: string;
  stdout: string;
}

export interface RealGitFixture {
  root: string;
  primary: string;
  worktrees: string[];
  bin: string;
  globalConfig: string;
}

export function createRealGitFixture(
  options: {
    localWorktreeConfig?: boolean;
    globalWorktreeConfig?: boolean;
  } = {}
): RealGitFixture {
  const root = mkdtempSync(join(tmpdir(), 'myk9 bootstrap concurrent real\n git '));
  const primary = join(root, 'primary\ncheckout');
  const worktrees = [join(root, 'worktree one'), join(root, 'worktree two')];
  const bin = join(root, 'bin');
  const globalConfig = join(root, 'global config');
  execFileSync('mkdir', ['-p', primary, bin]);
  writeFileSync(
    globalConfig,
    `[core]\n\thooksPath = /global/hooks\n${options.globalWorktreeConfig ? '\n[extensions]\n\tworktreeConfig = true\n' : ''}`
  );
  const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1' };
  const runGit = (args: string[]) => execFileSync('git', args, { env: gitEnv });
  runGit(['init', '-q', primary]);
  runGit(['-C', primary, 'config', 'user.email', 'bootstrap-test@example.invalid']);
  runGit(['-C', primary, 'config', 'user.name', 'Bootstrap Test']);
  if (options.localWorktreeConfig !== false) {
    runGit(['-C', primary, 'config', 'extensions.worktreeConfig', 'true']);
  }
  execFileSync('mkdir', ['-p', join(primary, '.githooks')]);
  writeFileSync(join(primary, '.githooks/pre-commit'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  runGit(['-C', primary, 'add', '.githooks/pre-commit']);
  runGit(['-C', primary, 'commit', '-qm', 'fixture']);
  for (const [index, worktree] of worktrees.entries()) {
    runGit(['-C', primary, 'worktree', 'add', '-q', '-b', `bootstrap-${index}`, worktree, 'HEAD']);
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
    other_hooks="$(git -C "$MYK9_BOOTSTRAP_OTHER_WORKTREE" config --get core.hooksPath 2>/dev/null || true)"
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

export function runBootstrapAt(
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
