// Behavioural tests for scripts/cloud/dispatch-cloud-session.sh (MYK9-1437): a fake `claude`
// on PATH records its argv, and the script's parsing, exit codes and timeout are asserted on
// what actually ran, not on the script's text.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = join(process.cwd(), 'scripts/cloud/dispatch-cloud-session.sh');
const PROMPT =
  'You are the implementer for MYK9-1.\n\n1. Setup.\n2. Branch: keep the provisioned one.\n';

type Sandbox = { dir: string; stubs: string; callLog: string; promptFile: string; logFile: string };

function makeSandbox(): Sandbox {
  const dir = mkdtempSync(join(tmpdir(), 'dispatch-cloud-'));
  const stubs = join(dir, 'bin');
  const callLog = join(dir, 'claude-calls.txt');
  const promptFile = join(dir, 'prompt.md');
  const logFile = join(dir, 'dispatch.log');
  spawnSync('mkdir', ['-p', stubs]);
  writeFileSync(promptFile, PROMPT);
  // One argv entry per line, so a multi-line prompt is visible as one argument with embedded newlines
  // (a NUL separator keeps it unambiguous).
  const fake = join(stubs, 'claude');
  writeFileSync(
    fake,
    [
      '#!/usr/bin/env bash',
      'printf "%s\\0" "$@" > "$CALL_LOG"',
      'case "${FAKE_MODE:-ok}" in',
      '  ok)',
      '    echo "Created cloud session: Fake session title"',
      '    echo "View: https://claude.ai/code/session_01FAKEabc123?from=cli&m=0"',
      '    echo "Resume with: claude --teleport session_01FAKEabc123"',
      '    ;;',
      '  signin) echo "Not logged in. Run claude auth login first." >&2; exit 1 ;;',
      '  hang) sleep 30 ;;',
      'esac',
      '',
    ].join('\n')
  );
  chmodSync(fake, 0o755);
  return { dir, stubs, callLog, promptFile, logFile };
}

function run(sb: Sandbox, args: string[], env: Record<string, string> = {}) {
  return spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${sb.stubs}:${dirname(process.execPath)}:/usr/bin:/bin`,
      CALL_LOG: sb.callLog,
      ...env,
    },
  });
}

describe('dispatch-cloud-session.sh', () => {
  let sb: Sandbox;
  beforeEach(() => {
    sb = makeSandbox();
  });
  afterEach(() => {
    rmSync(sb.dir, { recursive: true, force: true });
  });

  it('runs claude --cloud with the lane flags and the whole prompt, and prints the session lines', () => {
    const result = run(sb, [sb.promptFile, sb.logFile]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('SESSION_NAME=Fake session title');
    expect(result.stdout).toContain('SESSION_URL=https://claude.ai/code/session_01FAKEabc123');
    expect(result.stdout).not.toContain('?from=cli');
    expect(result.stdout).toContain(`DISPATCH_LOG=${sb.logFile}`);

    const argv = readFileSync(sb.callLog, 'utf8')
      .split('\0')
      .filter(a => a.length > 0);
    expect(argv[0]).toBe('--cloud');
    // `$(cat file)` drops trailing newlines, which the CLI does not care about; the body,
    // including its interior blank line, must arrive as one argument.
    expect(argv[1]).toBe(PROMPT.replace(/\n+$/, ''));
    expect(argv.slice(2)).toEqual([
      '--permission-mode',
      'dontAsk',
      '--disallowedTools',
      'mcp__claude-code-remote__create_trigger',
      '--model',
      'sonnet',
    ]);
    expect(readFileSync(sb.logFile, 'utf8')).toContain('Created cloud session');
  });

  it('honours CLOUD_MODEL and CLOUD_EXTRA_ARGS', () => {
    const result = run(sb, [sb.promptFile, sb.logFile], {
      CLOUD_MODEL: 'opus',
      CLOUD_EXTRA_ARGS: '--effort high',
    });
    expect(result.status, result.stderr).toBe(0);
    const argv = readFileSync(sb.callLog, 'utf8')
      .split('\0')
      .filter(a => a.length > 0);
    expect(argv.slice(-4)).toEqual(['--model', 'opus', '--effort', 'high']);
  });

  it('exits 3 and echoes the CLI output when no session URL is printed (sign-in error)', () => {
    const result = run(sb, [sb.promptFile, sb.logFile], { FAKE_MODE: 'signin' });
    expect(result.status).toBe(3);
    expect(result.stdout).not.toContain('SESSION_URL=');
    expect(result.stdout).toContain(`DISPATCH_LOG=${sb.logFile}`);
    expect(result.stderr).toContain('no session URL');
    expect(result.stderr).toContain('Not logged in');
  });

  it('exits 4 when the CLI prints nothing within DISPATCH_TIMEOUT_S, and does not retry', () => {
    const started = Date.now();
    const result = run(sb, [sb.promptFile, sb.logFile], {
      FAKE_MODE: 'hang',
      DISPATCH_TIMEOUT_S: '2',
    });
    expect(result.status).toBe(4);
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(result.stderr).toContain('timed_out=1');
    // Exactly one invocation of the CLI, whatever happened.
    expect(
      readFileSync(sb.callLog, 'utf8')
        .split('\0')
        .filter(a => a === '--cloud')
    ).toHaveLength(1);
  });

  it('exits 2 without running the CLI when the prompt file is missing', () => {
    const result = run(sb, [join(sb.dir, 'absent.md'), sb.logFile]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('prompt file must exist');
    expect(() => readFileSync(sb.callLog, 'utf8')).toThrow();
  });
});
