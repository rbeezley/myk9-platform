import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The vendored git-guardrails hook is a program, so it gets a behavioural
 * test: feed it the JSON Claude Code sends a PreToolUse hook and assert the
 * exit code. Codex's review of #2064 showed the upstream substring matcher
 * let `git -C /repo push`, `git clean -df` and `git branch --delete --force x`
 * through; those are pinned here alongside the forms it always caught.
 */
const HOOK = resolve(
  import.meta.dirname,
  '../../.agents/skills/git-guardrails-claude-code/scripts/block-dangerous-git.sh'
);

function verdict(command: string): number {
  try {
    execFileSync('bash', [HOOK], {
      input: JSON.stringify({ tool_input: { command } }),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return 0;
  } catch (error) {
    return (error as { status: number }).status;
  }
}

describe('block-dangerous-git.sh', () => {
  it.each([
    'git push',
    'git push --force origin main',
    'git -C /tmp/repo push origin main',
    'git -c core.pager=cat push',
    'GIT_TRACE=1 git push',
    'pnpm build && git push',
    'git reset --hard HEAD~1',
    'git clean -fd',
    'git clean -df',
    'git clean -f',
    'git clean --force',
    'git branch -D feature',
    'git branch --delete --force feature',
    'git branch -d -f feature',
    'git checkout .',
    'git restore .',
  ])('blocks %j', command => {
    expect(verdict(command)).toBe(2);
  });

  it.each([
    'git status',
    'git log --oneline -5',
    'git reset --soft HEAD~1',
    'git clean -n',
    'git branch -d merged-branch',
    'git branch --delete merged-branch',
    'git checkout main',
    'git restore src/file.ts',
    'echo "git push" > notes.txt',
    'ls',
  ])('allows %j', command => {
    expect(verdict(command)).toBe(0);
  });

  it('allows an empty command payload', () => {
    expect(verdict('')).toBe(0);
  });
});
