import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { evaluateCommand, evaluateHook, sleepSeconds, tokenize } from './no-ci-polling.ts';

/**
 * Known-answer fixtures in both directions. A deny-guard fails silently, so
 * every rule has a command it must refuse and a near neighbour it must allow
 * (LESSONS guard-word-split, mutation-actually-mutated).
 */
const REPO = '/Users/richardbeezley/AI Projects/myk9-platform';

const REFUSE: Array<[string, string]> = [
  ['sleep 60', 'sleep'],
  ['sleep 10', 'sleep'],
  ['sleep 1m', 'sleep'],
  ['sleep 5 5', 'sleep'],
  ['sleep "$DELAY"', 'sleep'],
  ['sleep 30 && gh pr checks 123', 'sleep'],
  ['gh pr checks 123; sleep 45; gh pr checks 123', 'sleep'],
  ['/bin/sleep 120', 'sleep'],
  ['(sleep 60)', 'sleep'],
  ['echo `sleep 60`', 'sleep'],
  ['cat <<EOF > f\nhello\nEOF\nsleep 60', 'sleep'],
  ['for i in 1 2; do echo $i; done; while true; do sleep 2; done', 'sleep-in-loop'],
  ['FOO=1 command sleep 30', 'sleep'],
  ['timeout 600 sleep 300', 'sleep'],
  ['while true; do gh pr checks 1; sleep 2; done', 'sleep-in-loop'],
  ['until gh run view 9 --json status | grep -q completed; do sleep 5; done', 'sleep-in-loop'],
  [`cd "${REPO}" && sleep 90`, 'sleep'],
  ["bash -c 'sleep 60 && gh run view 1'", 'sleep'],
  ['gh run watch 456', 'gh-run-watch'],
  ['gh -R rbeezley/myk9-platform run watch 456 --exit-status', 'gh-run-watch'],
  ['gh pr checks 123 --watch', 'gh-pr-checks-watch'],
  ['gh pr checks 123 --watch --interval 30', 'gh-pr-checks-watch'],
];

const ALLOW: string[] = [
  'gh pr checks 123',
  'gh run view 456 --log-failed',
  'bash scripts/qa/watch-pr-checks.sh 3383',
  'sleep 2',
  'sleep 0.5 && curl -s localhost:5173',
  'echo "sleep 60"',
  "grep -rn 'sleep 60' scripts",
  'git commit -m "docs: never sleep 60 while waiting on CI"',
  `cd "${REPO}/.claude/worktrees/sleep 60" && git status`,
  'bash scripts/some-script-that-sleeps.sh',
  'for f in a b; do echo $f; done',
  'pnpm vitest run scripts/qa/no-ci-polling.test.ts # then; sleep 60',
  'gh run list --limit 5',
  // Heredoc bodies are data: writing a script or message that mentions sleep is not a wait.
  "cat <<'EOF' > f\nsleep 60\nEOF",
  'cat > f <<EOF\nwhile true; do sleep 1; done\nEOF',
  'cat <<-EOF\n\tsleep 60\n\tEOF',
  // `while`/`until` count only in command position, and only until their `done`.
  'echo while; sleep 3',
  'sleep 1; while read x; do echo $x; done < f; sleep 2',
  'if [ -f x ]; then sleep 2; fi; until false; do break; done',
];

describe('evaluateCommand', () => {
  it.each(REFUSE)('refuses %s', (command, rule) => {
    expect(evaluateCommand(command)).toEqual({ deny: true, rule });
  });

  it.each(ALLOW)('allows %s', command => {
    expect(evaluateCommand(command)).toEqual({ deny: false });
  });
});

describe('evaluateHook', () => {
  it('allows any command the harness runs in the background', () => {
    expect(
      evaluateHook({
        tool_name: 'Bash',
        tool_input: { command: 'sleep 600', run_in_background: true },
      })
    ).toEqual({ deny: false });
  });

  it('ignores tools other than Bash', () => {
    expect(evaluateHook({ tool_name: 'Read', tool_input: { command: 'sleep 600' } })).toEqual({
      deny: false,
    });
  });

  it.each([{}, { tool_name: 'Bash' }, { tool_name: 'Bash', tool_input: { command: 42 } }])(
    'allows a payload with no command string: %o',
    payload => {
      expect(evaluateHook(payload)).toEqual({ deny: false });
    }
  );

  it('refuses a foreground poll', () => {
    expect(evaluateHook({ tool_name: 'Bash', tool_input: { command: 'sleep 600' } }).deny).toBe(
      true
    );
  });
});

describe('tokenize', () => {
  it('keeps a quoted path with a space as one word', () => {
    expect(tokenize(`cd "${REPO}" && ls`).map(t => t.text)).toEqual(['cd', REPO, '&&', 'ls']);
  });
});

describe('sleepSeconds', () => {
  it('reads suffixes and sums arguments, and gives up on variables', () => {
    expect(sleepSeconds(['1m', '30'])).toBe(90);
    expect(sleepSeconds(['.5'])).toBe(0.5);
    expect(sleepSeconds(['$N'])).toBeNull();
  });
});

describe('the hook as Claude Code runs it', () => {
  const script = join(import.meta.dirname, 'no-ci-polling.ts');
  const run = (payload: unknown): string =>
    execFileSync(
      'node',
      ['--experimental-strip-types', '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', script],
      { input: JSON.stringify(payload), encoding: 'utf8' }
    );

  it('prints a PreToolUse deny decision for a foreground sleep', () => {
    const out = JSON.parse(run({ tool_name: 'Bash', tool_input: { command: 'sleep 60' } }));
    expect(out.hookSpecificOutput).toMatchObject({
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
    });
    expect(out.hookSpecificOutput.permissionDecisionReason).toContain('watch-pr-checks.sh');
  });

  it('prints nothing for an allowed command', () => {
    expect(run({ tool_name: 'Bash', tool_input: { command: 'gh pr checks 1' } })).toBe('');
  });
});
