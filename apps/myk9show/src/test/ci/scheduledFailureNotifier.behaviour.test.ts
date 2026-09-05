import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  stdout: string;
  calls: string[];
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
  try {
    const stdout = execFileSync('bash', [scriptPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
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
    const calls = readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
    return { stdout, calls };
  } catch (error: unknown) {
    const failure = error as Error & {
      status?: number | null;
      signal?: string | null;
      stderr?: string | Buffer;
      stdout?: string | Buffer;
    };
    throw new Error(
      `Notifier failed: status=${failure.status ?? 'unknown'} signal=${failure.signal ?? 'none'}\n` +
        `stderr: ${String(failure.stderr ?? '').slice(-4000)}\n` +
        `stdout: ${String(failure.stdout ?? '').slice(-4000)}\n` +
        `script: ${scriptPath}\n${script
          .split('\n')
          .map((line, index) => `${index + 1}: ${line}`)
          .join('\n')}`,
      { cause: error }
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const verbs = (calls: string[]) =>
  calls.filter(c => c.startsWith('issue ')).map(c => c.split(' ').slice(0, 2).join(' '));

describe('scheduled-failure notifier', () => {
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

  it('collapses duplicates on the recovery path too', () => {
    const closed = run('success', ['42', '77'])
      .calls.filter(c => c.startsWith('issue close'))
      .map(c => c.split(' ')[2]);
    expect(closed).toEqual(['77', '42']);
  });
});
