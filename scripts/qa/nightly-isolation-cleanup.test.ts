import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const cleanupScript = join(process.cwd(), 'scripts/qa/cleanup-nightly-isolated.sh');

const temporaryDirectories: string[] = [];

function runGit(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function createRepository(): string {
  const repository = mkdtempSync(join(tmpdir(), 'myk9-nightly-cleanup-'));
  temporaryDirectories.push(repository);
  runGit(repository, 'init', '--initial-branch=main');
  runGit(repository, 'config', 'user.email', 'nightly@example.test');
  runGit(repository, 'config', 'user.name', 'Nightly QA');
  writeFileSync(join(repository, 'README.md'), 'nightly test\n');
  runGit(repository, 'add', 'README.md');
  runGit(repository, 'commit', '-m', 'test: seed nightly cleanup repository');
  return repository;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('nightly isolated cleanup', () => {
  it('exposes a managed run command with exit cleanup', () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const runner = readFileSync(join(process.cwd(), 'scripts/qa/run-nightly.sh'), 'utf8');

    expect(packageJson.scripts?.['qa:nightly:run']).toBe('bash scripts/qa/run-nightly.sh');
    expect(runner).toContain('trap cleanup EXIT');
    expect(runner).toContain('cleanup-nightly-isolated.sh');
  });

  it('removes the temporary worktree and its run-scoped report branch', () => {
    const repository = createRepository();
    const worktree = join(repository, 'nightly-worktree');
    const reportBranch = 'codex/nightly-qa-test';

    runGit(repository, 'worktree', 'add', '-b', reportBranch, worktree, 'HEAD');
    writeFileSync(join(worktree, '.qa-nightly.env'), 'generated\n');

    execFileSync('bash', [cleanupScript, worktree, reportBranch], {
      cwd: repository,
      stdio: 'pipe',
    });

    expect(existsSync(worktree)).toBe(false);
    expect(runGit(repository, 'branch', '--list', reportBranch)).toBe('');
    expect(runGit(repository, 'worktree', 'list')).not.toContain(worktree);
  });
});
