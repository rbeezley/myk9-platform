import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { findStrayLogWrites, suggestedPath } from './logs-path-guard.ts';

/**
 * Known-answer fixtures. The "refused" cases are real commands from session
 * transcripts that produced the 47 stray files found on 2026-10-07; the
 * "allowed" cases are the shapes the guard must never block.
 */
const REFUSED: ReadonlyArray<[string, string[]]> = [
  ['bash scripts/qa/watch-pr-checks.sh 2607 > .logs-w-2607.txt', ['.logs-w-2607.txt']],
  ['pnpm -s qa:codex-review origin/main --post < /dev/null > .logs-codex.txt', ['.logs-codex.txt']],
  ['pnpm vitest run src/a.test.tsx > ../../.logs-sc1.txt 2>&1', ['../../.logs-sc1.txt']],
  [
    'bash x.sh >> "/Users/richardbeezley/AI Projects/.logs-w-$p.txt"',
    ['/Users/richardbeezley/AI Projects/.logs-w-$p.txt'],
  ],
  ["pnpm test 2> '.logs-err.txt'", ['.logs-err.txt']],
  ['pnpm test &> .logs-all.txt', ['.logs-all.txt']],
  ['pnpm test>.logs-tight.txt', ['.logs-tight.txt']],
  ['pnpm test 2>&1 | tee -a .logs-deploy4.txt', ['.logs-deploy4.txt']],
  ['cd x && bash scripts/bootstrap-worktree.sh > .logs-boot.txt; echo done', ['.logs-boot.txt']],
  // Codex review #2812: adjacent quoted and bare segments are ONE path.
  [
    'pnpm test > "/Users/richardbeezley/AI Projects"/.logs-old.txt',
    ['/Users/richardbeezley/AI Projects/.logs-old.txt'],
  ],
  ['pnpm test >& .logs-both.txt', ['.logs-both.txt']],
  ['FOO=1 tee -a out.txt .logs-two.txt < in.txt', ['.logs-two.txt']],
  ['cat <<EOF > .logs-after-heredoc.txt\nbody\nEOF', ['.logs-after-heredoc.txt']],
];

const ALLOWED: readonly string[] = [
  'pnpm test > .logs/suite.log 2>&1; echo "EXIT=$?"',
  'pnpm test > "/Users/richardbeezley/AI Projects/myk9-platform/.logs/suite.log" 2>&1',
  'tail -3 .logs-w-2609.txt',
  'cat .logs-deploy.txt | grep error',
  'pnpm test 2>&1 | tee .logs/run.txt',
  'echo hi >&2',
  'ls > /dev/null 2>&1',
  'cat <<EOF > notes.txt\nhello\nEOF',
  'git commit -m "committee notes"',
  // Codex review #2812: quoted prose is not a redirect, and tee stops at a newline.
  'git commit -m "Prevent > .logs-old.txt writes"',
  "echo 'a > .logs-x.txt'",
  'pnpm test | tee .logs/run.txt\ncat .logs-old.txt',
  'pnpm test | tee .logs/run.txt; cat .logs-old.txt',
  "cat <<'EOF' > .logs/notes.txt\nthen run > .logs-x.txt\nEOF",
  'git commit -F - <<EOF\nfix: stop writing > .logs-x.txt\nEOF',
  'grep -c x < .logs-old.txt',
  'pnpm test 2>&1 >&2',
];

describe('findStrayLogWrites', () => {
  it.each(REFUSED)('refuses %s', (command, expected) => {
    expect(findStrayLogWrites(command)).toEqual(expected);
  });

  it.each(ALLOWED)('allows %s', command => {
    expect(findStrayLogWrites(command)).toEqual([]);
  });
});

describe('suggestedPath', () => {
  it('moves the name under .logs/ and keeps the directory', () => {
    expect(suggestedPath('../../.logs-w-2790.txt')).toBe('../../.logs/w-2790.txt');
    expect(suggestedPath('/a b/.logs-codex.txt')).toBe('/a b/.logs/codex.txt');
  });
});

/**
 * Run the real hook entry point the way Claude Code does: JSON on stdin, from
 * a path containing a space (this repo's own). A direct-execution check built
 * from a `file://` template string never matches such a path, and the hook
 * then allows everything while every unit test above still passes.
 */
describe('hook entry point', () => {
  const script = fileURLToPath(new URL('./logs-path-guard.ts', import.meta.url));

  function runHook(input: string): string {
    return execFileSync(
      'node',
      ['--experimental-strip-types', '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', script],
      { input, encoding: 'utf8' }
    );
  }

  it('emits a PreToolUse deny naming the corrected path', () => {
    const out = runHook(JSON.stringify({ tool_input: { command: 'pnpm test > .logs-x.txt' } }));
    const parsed = JSON.parse(out) as {
      hookSpecificOutput: {
        hookEventName: string;
        permissionDecision: string;
        permissionDecisionReason: string;
      };
    };
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('.logs/x.txt');
  });

  it('prints nothing for an allowed command', () => {
    expect(runHook(JSON.stringify({ tool_input: { command: 'pnpm test > .logs/x.txt' } }))).toBe(
      ''
    );
  });

  it('allows (exit 0, no output) when the input is not JSON', () => {
    expect(runHook('not json')).toBe('');
  });
});
