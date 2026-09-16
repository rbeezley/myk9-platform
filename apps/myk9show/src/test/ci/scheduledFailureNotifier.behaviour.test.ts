import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Executes the notifier's shell against a stubbed `gh` and asserts the calls it
 * makes.
 *
 * The sibling `scheduledFailureNotification.test.ts` asserts WIRING — which
 * workflows reference the action — and that is a fair use of source text,
 * because deleting the wiring deletes the string.
 *
 * Asserting the action's INTERNALS that way is not. It was tried and it failed
 * silently: `expect(action).toContain('|| [ -n "$dup" ]')` passed with the
 * guard deleted, because the comment explaining the guard still contained the
 * string. A mutation run caught it; nothing else would have. That is the
 * repo's standing lesson about source-text tests certifying a no-op, met in
 * person.
 *
 * So this runs the thing. Every assertion below fails if the corresponding
 * behaviour is removed.
 *
 * MYK9-412: the original CI failure has no captured stderr, so its cause is
 * unconfirmed. Each invocation now owns and cleans its fixture directory;
 * captured status/signal/output and ERR line context make future failures
 * diagnosable. Only fixture environment values reach bash (no real tokens).
 */

const actionPath = resolve(
  __dirname,
  '../../../../../.github/actions/report-scheduled-failure/action.yml'
);

/**
 * Pull the composite step's `run:` block out of the action and dedent it.
 *
 * The indent is measured from the first body line rather than hard-coded — a
 * hard-coded width silently found nothing when the block sat at a different
 * depth than assumed, which turns every assertion below into a skip.
 */
function extractScript(): string {
  const source = readFileSync(actionPath, 'utf8');
  const match = /^(\s*)run: \|\s*$/m.exec(source);
  if (!match) throw new Error('run block not found in action.yml');

  const lines = source.slice(source.indexOf('\n', match.index) + 1).split('\n');
  const first = lines.find(line => line.trim() !== '');
  const indent = first ? (/^\s*/.exec(first)?.[0].length ?? 0) : 0;
  if (indent <= (match[1]?.length ?? 0)) {
    throw new Error('run block body is not indented past its key');
  }

  const out: string[] = [];
  for (const line of lines) {
    if (line.trim() !== '' && /^\s*/.exec(line)![0].length < indent) break;
    out.push(line.slice(indent));
  }
  return out.join('\n');
}

interface RunResult {
  calls: string[];
}

/**
 * Describe a failed notifier run.
 *
 * `code` and `errno` are printed, not just `status` and `signal`. Those are
 * the fields that tell an internal `spawnSync` failure (ENOBUFS from
 * `maxBuffer`, ETIMEDOUT from `timeout`) apart from the script exiting on its
 * own, and MYK9-578 spent two review rounds arguing over a
 * `status=141 signal=none` line that could not say which it was — because the
 * diagnostic had never printed them. A child killed by the closed read end
 * before an ENOBUFS SIGTERM lands is reported with its own status, so the
 * status alone genuinely cannot distinguish the two.
 */
function describeFailure(
  error: unknown,
  context: { stderr: string; stdout: string; scriptPath: string; script: string }
): string {
  const failure = error as Error & {
    status?: number | null;
    signal?: string | null;
    code?: string | number | null;
    errno?: number | null;
  };
  return (
    `Notifier failed: status=${failure.status ?? 'unknown'} ` +
    `signal=${failure.signal ?? 'none'} ` +
    `code=${failure.code ?? 'none'} errno=${failure.errno ?? 'none'}\n` +
    `stderr: ${context.stderr.slice(-4000)}\n` +
    `stdout: ${context.stdout.slice(-4000)}\n` +
    `script: ${context.scriptPath}\n${context.script
      .split('\n')
      .map((line, index) => `${index + 1}: ${line}`)
      .join('\n')}`
  );
}

function run(outcome: string, openIssues: string[], fail = false, silent = false): RunResult {
  const dir = mkdtempSync(join(tmpdir(), 'notifier-'));
  const scriptPath = join(dir, 'notify.sh');
  const script = `set -E\ntrap 'echo "notify.sh line $LINENO: $BASH_COMMAND" >&2' ERR\n${extractScript()}`;
  writeFileSync(scriptPath, script);

  const binDir = join(dir, 'bin');
  mkdirSync(binDir);
  const logPath = join(dir, 'calls.log');

  // Stub gh: records each invocation and replays a scripted `issue list`.
  const stub = [
    '#!/bin/bash',
    'echo "$*" >> "$STUB_LOG"',
    'if [ "$1 $2" = "issue list" ] && [ "${STUB_FAIL:-}" = "yes" ]; then [ "${STUB_SILENT:-}" = "yes" ] || echo "fixture list failed" >&2; exit 23; fi',
    'case "$1 $2" in',
    '  "issue list") printf \'%s\' "${STUB_OPEN_ISSUES:-}" ;;',
    '  *) exit 0 ;;',
    'esac',
  ].join('\n');
  const ghPath = join(binDir, 'gh');
  writeFileSync(ghPath, stub);
  chmodSync(ghPath, 0o755);
  writeFileSync(logPath, '');

  // MYK9-578: stdout and stderr go to FILES, never pipes.
  //
  // `stdio: ['ignore', 'pipe', 'pipe']` puts a reader between node and the
  // script. A reader that leaves while the script is still writing kills the
  // writer with SIGPIPE, and because the notifier's progress lines used to run
  // inside a pipeline subshell, `pipefail` turned that into the incident's
  // `status=141 signal=none` — measured in `.logs/578-exp.mjs`: destroy the
  // reader early and the pre-fix script exits exactly 141 with no signal,
  // while these file descriptors make the same run exit 0.
  //
  // What that does NOT establish is which early close fired in CI. `maxBuffer`
  // is not excluded: its ENOBUFS path reports `signal=SIGTERM` only when the
  // SIGTERM lands first, and a child that dies of the closed read end before
  // then is reported with its own status instead — `status=141 signal=none`,
  // ENOBUFS hidden, 5/5 in review's replay. Read the shape as "the read end
  // closed early", not as a named cause. The trigger is still unidentified.
  //
  // File descriptors remove the reader and the buffer accounting together, so
  // they cover every branch of that ambiguity at once. Only the harness ever
  // put a closable reader there: a workflow step's stdout is held open by the
  // runner for the step's lifetime, so this is a fixture defect, not a
  // notifier one.
  const stdoutPath = join(dir, 'stdout.txt');
  const stderrPath = join(dir, 'stderr.txt');
  const outFd = openSync(stdoutPath, 'w');
  const errFd = openSync(stderrPath, 'w');
  let closed = false;
  const closeFds = () => {
    if (closed) return;
    closed = true;
    closeSync(outFd);
    closeSync(errFd);
  };
  const readCaptured = (path: string) => {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return '';
    }
  };

  try {
    execFileSync('bash', [scriptPath], {
      stdio: ['ignore', outFd, errFd],
      env: {
        PATH: `${binDir}:/usr/bin:/bin`,
        STUB_LOG: logPath,
        STUB_FAIL: fail ? 'yes' : 'no',
        STUB_SILENT: silent ? 'yes' : 'no',
        STUB_OPEN_ISSUES: openIssues.join('\n'),
        WORKFLOW_NAME: 'Playwright Regression',
        OUTCOME: outcome,
        EXTRA: 'A curated journey broke.',
        RUN_URL: 'https://github.com/o/r/actions/runs/9',
        REPO: 'o/r',
      },
    });
    closeFds();
    const calls = readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
    return { calls };
  } catch (error: unknown) {
    closeFds();
    throw new Error(
      describeFailure(error, {
        stderr: readCaptured(stderrPath),
        stdout: readCaptured(stdoutPath),
        scriptPath,
        script,
      }),
      { cause: error }
    );
  } finally {
    closeFds();
    rmSync(dir, { recursive: true, force: true });
  }
}

const verbs = (calls: string[]) =>
  calls.filter(c => c.startsWith('issue ')).map(c => c.split(' ').slice(0, 2).join(' '));

describe('scheduled-failure notifier', () => {
  it('surfaces a spawn error code and errno, not just the exit status', () => {
    // MYK9-578 round 3. The incident line read `status=141 signal=none` and
    // could not say whether the script had exited 141 or `spawnSync` had
    // failed internally (ENOBUFS from `maxBuffer`, ETIMEDOUT from `timeout`),
    // because a child that dies before the SIGTERM lands is reported with its
    // own status and the ENOBUFS stays hidden on `code`. Two review rounds
    // went on that ambiguity. Print the fields that resolve it.
    const spawnError = Object.assign(new Error('spawnSync bash ENOBUFS'), {
      status: 141,
      signal: null,
      code: 'ENOBUFS',
      errno: -55,
    });

    const message = describeFailure(spawnError, {
      stderr: 'fixture stderr',
      stdout: 'fixture stdout',
      scriptPath: '/tmp/notify.sh',
      script: 'set -euo pipefail',
    });

    expect(message).toContain('status=141 signal=none code=ENOBUFS errno=-55');
  });

  it('reports a shell line when the failed stub produces no stderr', () => {
    expect(() => run('failure', [], true, true)).toThrow(/status=23[\s\S]*notify.sh line \d+/);
  });
  it('reports command exit status, stderr and script context without swallowing failure', () => {
    expect(() => run('failure', [], true)).toThrow(
      /status=23[\s\S]*fixture list failed[\s\S]*notify.sh/
    );
  });

  it('opens an issue when a workflow goes red', () => {
    expect(verbs(run('failure', []).calls)).toEqual(['issue list', 'issue create']);
  });

  it('edits rather than comments while it stays red', () => {
    // Support Triage runs every 15 minutes. Commenting per failure would post
    // ~96 notifications a day and teach the reader to mute the one channel
    // that matters.
    const { calls } = run('failure', ['42']);
    expect(verbs(calls)).toEqual(['issue list', 'issue edit']);
    expect(verbs(calls)).not.toContain('issue comment');
  });

  it('closes the issue when the workflow recovers', () => {
    // This is what makes an OPEN issue mean "broken right now".
    expect(verbs(run('success', ['42']).calls)).toEqual([
      'issue list',
      'issue comment',
      'issue close',
    ]);
  });

  it('does nothing when green with no issue open', () => {
    expect(verbs(run('success', []).calls)).toEqual(['issue list']);
  });

  it('collapses EVERY duplicate, including the last', () => {
    // The regression that a source-text assertion could not see. MATCHES has
    // no trailing newline, so a bare `while read` drops the final entry: with
    // three issues open, #91 survived while #77 was closed.
    const { calls } = run('failure', ['42', '77', '91']);
    const closed = calls.filter(c => c.startsWith('issue close')).map(c => c.split(' ')[2]);
    expect(closed).toEqual(['77', '91']);
    expect(verbs(calls)).toContain('issue edit');
  });

  it('keeps the FIRST listed issue and closes the rest', () => {
    // Scoped to what this shell actually owns. Ordering is delegated to
    // `gh issue list --jq '... | sort'`, which the stub does not implement —
    // asserting "42 wins" here would have been asserting the stub. The sibling
    // static test pins the `| sort | .[]` expression that makes the first entry
    // the lowest-numbered one; together they cover the invariant that every
    // concurrent run picks the same survivor.
    const { calls } = run('failure', ['91', '42', '77']);
    expect(calls.find(c => c.startsWith('issue edit'))).toContain('91');
    const closed = calls.filter(c => c.startsWith('issue close')).map(c => c.split(' ')[2]);
    expect(closed).toEqual(['42', '77']);
  });

  it('survives a MATCHES list larger than a pipe buffer (latent bug, not the incident)', () => {
    // A LATENT bug, deliberately labelled as one. Round 1 diagnosed this
    // pipeline as the cause of the MYK9-578 incident; it was not. A
    // shell-semantics review ran the pre-fix block against the failing test's
    // own payload 1000 times under load with 0 failures: MATCHES was 8 bytes,
    // the whole write lands in the pipe buffer before `head` can leave, and
    // `gh issue list --limit 100` caps MATCHES near 800 bytes. The incident
    // cannot have come from here.
    //
    // It is still a real defect: give it more than one pipe buffer after the
    // first newline and `printf | head -n 1` under `set -o pipefail` exits
    // 141. This guards the array lookup that replaced it. It asserts an
    // unreachable input on purpose — that is what makes it a latent-bug guard
    // rather than a reproduction of the incident.
    // Sizing this payload is pinched between two platform limits, so the
    // bounds are asserted rather than commented.
    //
    // It reaches the script through the ENVIRONMENT (`STUB_OPEN_ISSUES`,
    // replayed by the stub `gh`) and leaves again through argv (`gh issue
    // close "$dup"`). Linux caps any single argv or env string at
    // MAX_ARG_STRLEN, 128 KiB, so the first version of this test — 200 000
    // digits — never started bash at all on CI: `status=unknown signal=none
    // code=E2BIG errno=-7`, shard 1/6, Linux only. (Round 3's `code`/`errno`
    // fields are what named that; `status=unknown` alone would not have.)
    //
    // The floor is one pipe buffer, since that is what makes `printf` block
    // long enough for `head` to leave. Linux's is 64 KiB, so 96 KiB trips the
    // pre-fix script there and this guard is live on CI.
    //
    // It is NOT live on macOS, and that is measured, not assumed: a local
    // bisect put the threshold between 126 976 and 131 071 bytes, because
    // macOS pipes grow to ~128 KiB. That is at or above Linux's cap, so no
    // single-line payload can both trip macOS and exec on Linux. A green run
    // of this test on a Mac therefore proves nothing; CI is where it bites.
    const LINUX_PIPE_BUFFER_BYTES = 64 * 1024;
    const MAX_ARG_STRLEN = 128 * 1024;
    const oversized = '9'.repeat(96 * 1024);
    expect(oversized.length).toBeGreaterThan(LINUX_PIPE_BUFFER_BYTES);
    expect(oversized.length).toBeLessThan(MAX_ARG_STRLEN);

    const { calls } = run('failure', ['42', oversized]);
    expect(calls.find(c => c.startsWith('issue edit'))).toContain('issue edit 42 ');
    const closed = calls.filter(c => c.startsWith('issue close')).map(c => c.split(' ')[2]);
    expect(closed).toEqual([oversized]);
  });

  it('collapses duplicates on the recovery path too', () => {
    const closed = run('success', ['42', '77'])
      .calls.filter(c => c.startsWith('issue close'))
      .map(c => c.split(' ')[2]);
    expect(closed).toEqual(['77', '42']);
  });
});
