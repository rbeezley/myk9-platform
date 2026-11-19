import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * MYK9-2239 (docs/plan-merge-queue.md): the three scripts the merge queue
 * leans on, run for real against a stub `gh`, plus the CI wiring they need.
 *
 * The stub answers each call with the next scripted response (exit status and
 * the text `gh ... --jq` would print) and logs every argument, one per line,
 * so assertions match whole arguments rather than substrings.
 */
const QA = import.meta.dirname;
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

interface Reply {
  exit?: number;
  out?: string;
}

interface Run {
  status: number | null;
  stdout: string;
  output: string;
  calls: string[][];
}

const SHA = 'a'.repeat(40);
const PR_SHA = 'b'.repeat(40);
const QUEUE_SHA = 'c'.repeat(40);

function runScript(
  script: string,
  replies: Reply[],
  env: Record<string, string>,
  args: string[] = []
): Run {
  const bin = mkdtempSync(join(tmpdir(), 'merge-queue-gh-'));
  dirs.push(bin);
  replies.forEach((r, i) => {
    writeFileSync(join(bin, `reply-${i + 1}.out`), r.out ?? '');
    writeFileSync(join(bin, `reply-${i + 1}.exit`), String(r.exit ?? 0));
  });
  const log = join(bin, 'calls.log');
  const counter = join(bin, 'count');
  writeFileSync(counter, '0');
  writeFileSync(
    join(bin, 'gh'),
    [
      '#!/usr/bin/env bash',
      `{ printf '%s\\n' '--CALL--'; printf '%s\\n' "$@"; } >> "${log}"`,
      `n=$(( $(cat "${counter}") + 1 )); echo "$n" > "${counter}"`,
      `if [ ! -f "${bin}/reply-$n.exit" ]; then echo "stub gh: no reply $n" >&2; exit 99; fi`,
      `cat "${bin}/reply-$n.out"; [ -s "${bin}/reply-$n.out" ] && echo`,
      `exit "$(cat "${bin}/reply-$n.exit")"`,
      '',
    ].join('\n')
  );
  chmodSync(join(bin, 'gh'), 0o755);
  const output = join(bin, 'github-output');
  writeFileSync(output, '');
  const r = spawnSync('bash', [resolve(QA, script), ...args], {
    encoding: 'utf8',
    timeout: 20_000,
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      HOME: process.env.HOME,
      GITHUB_OUTPUT: output,
      POLL_SECONDS: '0',
      ...env,
    },
  });
  const calls = existsSync(log)
    ? readFileSync(log, 'utf8')
        .split('--CALL--\n')
        .filter(Boolean)
        .map(c => c.replace(/\n$/, '').split('\n'))
    : [];
  return {
    status: r.status,
    stdout: r.stdout,
    output: readFileSync(output, 'utf8'),
    calls,
  };
}

describe('ci-queue-verdict.sh: may a main push run skip its jobs?', () => {
  const verdict = (replies: Reply[], env: Record<string, string> = {}) =>
    runScript('ci-queue-verdict.sh', replies, { SHA, REPO: 'o/r', ...env });

  it('says tested=true only when a merge-queue run for this exact SHA concluded success', () => {
    const r = verdict([{ out: '42 completed success' }]);
    expect(r.output).toBe('tested=true\n');
    expect(r.status).toBe(0);
    const call = r.calls[0]!;
    expect(call.slice(0, 2)).toEqual(['run', 'list']);
    expect(call[call.indexOf('--event') + 1]).toBe('merge_group');
    expect(call[call.indexOf('--commit') + 1]).toBe(SHA);
    expect(call[call.indexOf('--workflow') + 1]).toBe('CI');
  });

  it.each([
    ['a failed queue run', [{ out: '42 completed failure' }]],
    ['a cancelled queue run', [{ out: '42 completed cancelled' }]],
    ['no queue run (a direct push)', [{ out: '' }]],
    ['a GitHub query that fails', [{ exit: 1 }]],
  ])('runs the full suite after %s', (_name, replies) => {
    const r = verdict(replies);
    expect(r.output).toBe('tested=false\n');
    expect(r.status).toBe(0);
  });

  it('waits for a queue run still in progress, then takes its verdict', () => {
    const r = verdict([
      { out: '42 in_progress null' },
      { out: '42 queued null' },
      { out: '42 completed success' },
    ]);
    expect(r.output).toBe('tested=true\n');
    expect(r.calls).toHaveLength(3);
  });

  it('gives up waiting and runs the full suite', () => {
    const r = verdict([{ out: '42 in_progress null' }], { WAIT_SECONDS: '0' });
    expect(r.output).toBe('tested=false\n');
    expect(r.stdout).toContain("still 'in_progress'");
  });

  it('runs the full suite when REPO is missing, without asking GitHub', () => {
    const r = verdict([], { REPO: '' });
    expect(r.output).toBe('tested=false\n');
    expect(r.calls).toEqual([]);
  });

  it('refuses a malformed SHA without asking GitHub', () => {
    const r = verdict([], { SHA: 'abc123' });
    expect(r.output).toBe('tested=false\n');
    expect(r.calls).toEqual([]);
  });
});

describe('merge-queue-review-gate.sh: mirror the PR head verdict onto the queue commit', () => {
  const HEAD_REF = `refs/heads/gh-readonly-queue/main/pr-4321-${PR_SHA}`;
  const mirror = (replies: Reply[], env: Record<string, string> = {}) =>
    runScript('merge-queue-review-gate.sh', replies, {
      REPO: 'o/r',
      HEAD_REF,
      HEAD_SHA: QUEUE_SHA,
      RUN_URL: 'https://example.test/run/1',
      ...env,
    });

  /** The `-f key=value` fields of a status POST. */
  function postedFields(call: string[]): Record<string, string> {
    const fields: Record<string, string> = {};
    call.forEach((arg, i) => {
      if (call[i - 1] === '-f') {
        const eq = arg.indexOf('=');
        fields[arg.slice(0, eq)] = arg.slice(eq + 1);
      }
    });
    return fields;
  }

  it('reads the PR head named in the queue ref and posts success on the queue SHA', () => {
    const r = mirror([{ out: 'success' }, { out: '' }]);
    expect(r.status).toBe(0);
    expect(r.calls[0]).toEqual([
      'api',
      `repos/o/r/commits/${PR_SHA}/status`,
      '--jq',
      '.statuses[] | select(.context == "Review gate") | .state',
    ]);
    const post = r.calls[1]!;
    expect(post.slice(0, 4)).toEqual([
      'api',
      '--method',
      'POST',
      `repos/o/r/statuses/${QUEUE_SHA}`,
    ]);
    const fields = postedFields(post);
    expect(fields.state).toBe('success');
    expect(fields.context).toBe('Review gate');
    expect(fields.description).toContain('PR #4321');
    expect(fields.description!.length).toBeLessThanOrEqual(140);
  });

  it.each([
    ['a red Review gate', [{ out: 'failure' }, { out: '' }]],
    ['a pending Review gate', [{ out: 'pending' }, { out: '' }]],
    ['no Review gate at all', [{ out: '' }, { out: '' }]],
    ['an unreadable status', [{ exit: 1 }, { out: '' }]],
  ])('posts failure on the queue SHA for %s', (_name, replies) => {
    const r = mirror(replies);
    expect(r.status).toBe(0);
    const post = r.calls.at(-1)!;
    expect(post[3]).toBe(`repos/o/r/statuses/${QUEUE_SHA}`);
    expect(postedFields(post).state).toBe('failure');
    expect(postedFields(post).context).toBe('Review gate');
  });

  it.each([
    ['a ref with no PR head SHA', 'refs/heads/gh-readonly-queue/main/pr-4321'],
    ['a short PR head SHA', 'refs/heads/gh-readonly-queue/main/pr-4321-bbbbbbb'],
    ['an ordinary branch', 'refs/heads/feature/x'],
  ])('posts failure without reading statuses for %s', (_name, headRef) => {
    const r = mirror([{ out: '' }], { HEAD_REF: headRef });
    expect(r.calls).toHaveLength(1);
    expect(postedFields(r.calls[0]!).state).toBe('failure');
  });

  it('posts nothing and fails when the queue SHA itself is unusable', () => {
    const r = mirror([], { HEAD_SHA: `${'c'.repeat(37)}../` });
    expect(r.status).toBe(1);
    expect(r.calls).toEqual([]);
  });

  it('caps the description at the 140 characters GitHub allows', () => {
    const r = mirror([{ out: 'x'.repeat(200) }, { out: '' }]);
    const description = postedFields(r.calls.at(-1)!).description!;
    expect(description).toHaveLength(140);
    expect(postedFields(r.calls.at(-1)!).state).toBe('failure');
  });

  it('fails without posting when REPO is missing', () => {
    const r = mirror([], { REPO: '' });
    expect(r.status).toBe(1);
    expect(r.calls).toEqual([]);
  });

  it('fails the step when the POST fails, so the workflow fallback posts red', () => {
    const r = mirror([{ out: 'success' }, { exit: 1 }]);
    expect(r.status).toBe(1);
  });
});

describe('wait-pr-merged.sh: did the queued PR land?', () => {
  const wait = (replies: Reply[], env: Record<string, string> = {}) =>
    runScript('wait-pr-merged.sh', replies, { REPO: 'o/r', ...env }, ['77']);

  it('exits 0 and prints the merge commit once merged', () => {
    const r = wait([{ out: 'OPEN true - false' }, { out: `MERGED false ${SHA} false` }]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`merged ${SHA}`);
    const call = r.calls[0]!;
    expect(call).toContain('number=77');
    expect(call).toContain('owner=o');
    expect(call).toContain('name=r');
  });

  it('keeps waiting while auto-merge is armed', () => {
    const r = wait([{ out: 'OPEN false - true' }, { out: `MERGED false ${SHA} false` }]);
    expect(r.status).toBe(0);
  });

  it('exits 1 when the PR is closed', () => {
    expect(wait([{ out: 'CLOSED false - false' }]).status).toBe(1);
  });

  it('exits 1 once the PR stays open outside the queue for the grace reads', () => {
    const r = wait([
      { out: 'OPEN true - false' },
      { out: 'OPEN false - false' },
      { out: 'OPEN false - false' },
    ]);
    expect(r.status).toBe(1);
    expect(r.calls).toHaveLength(3);
  });

  it('does not call one unqueued read a drop', () => {
    const r = wait([{ out: 'OPEN false - false' }, { out: `MERGED false ${SHA} false` }]);
    expect(r.status).toBe(0);
  });

  it('exits 3 (not a verdict) when GitHub cannot be read', () => {
    const r = wait(Array.from({ length: 5 }, () => ({ exit: 1 })));
    expect(r.status).toBe(3);
  });

  it('counts read errors in a row, not in total', () => {
    const fail = { exit: 1 };
    const r = wait([
      fail,
      fail,
      { out: 'OPEN true - false' },
      fail,
      fail,
      fail,
      fail,
      { out: `MERGED false ${SHA} false` },
    ]);
    expect(r.status).toBe(0);
  });

  it('exits 3 (not a verdict) on timeout', () => {
    const r = wait([{ out: 'OPEN true - false' }], { TIMEOUT_SECONDS: '0' });
    expect(r.status).toBe(3);
  });

  it('refuses a non-numeric PR', () => {
    const r = runScript('wait-pr-merged.sh', [], { REPO: 'o/r' }, ['abc']);
    expect(r.status).toBe(3);
    expect(r.calls).toEqual([]);
  });
});

describe('CI wiring for the merge queue', () => {
  const ci = readFileSync(resolve(QA, '../../.github/workflows/ci.yml'), 'utf8');
  const mirrorWorkflow = readFileSync(
    resolve(QA, '../../.github/workflows/review-gate-queue.yml'),
    'utf8'
  );

  /** job id -> its header lines (up to `steps:`), from the `jobs:` map. */
  function jobs(): Map<string, string> {
    const body = ci.slice(ci.indexOf('\njobs:\n'));
    const out = new Map<string, string>();
    for (const m of body.matchAll(
      /^ {2}([a-z0-9-]+):\n((?: {4}.*\n|\s*\n|#.*\n| {2}#.*\n)*?) {4}steps:/gm
    )) {
      out.set(m[1]!, m[2]!);
    }
    return out;
  }

  it('triggers on merge_group checks_requested', () => {
    expect(ci).toMatch(/^ {2}merge_group:\n {4}types: \[checks_requested\]$/m);
    expect(mirrorWorkflow).toMatch(/^ {2}merge_group:\n {4}types: \[checks_requested\]$/m);
  });

  it('runs Queue verdict only on main pushes, and only once the queue is switched on', () => {
    // Without the variable the job is skipped, so no main push waits for a
    // runner to run it while no queue exists (Codex round 8, #4219).
    expect(jobs().get('queue-verdict')).toMatch(
      /^ {4}if: github\.event_name == 'push' && vars\.MERGE_QUEUE_ENABLED == 'true'$/m
    );
  });

  it('lets every other job run in the merge queue', () => {
    const all = jobs();
    // Guards the header regex against silently matching nothing (ci.yml has 12 jobs).
    expect(all.size).toBeGreaterThanOrEqual(12);
    for (const [id, header] of all) {
      if (id === 'queue-verdict') continue;
      const ifLine = header.match(/^ {4}if: (.*)$/m)?.[1] ?? '';
      expect(ifLine, `${id} has no merge_group arm`).toContain(
        "github.event_name == 'merge_group'"
      );
    }
  });

  it('skips a queue-tested main push in every job that does not inherit the skip from its needs', () => {
    for (const [id, header] of jobs()) {
      if (id === 'queue-verdict') continue;
      const needs =
        header
          .match(/^ {4}needs: \[([^\]]*)\]$/m)?.[1]
          ?.split(',')
          .map(s => s.trim()) ?? [];
      const ifLine = header.match(/^ {4}if: (.*)$/m)?.[1] ?? '';
      if (needs.includes('queue-verdict')) {
        // A push runs this job only when the queue did not already test the SHA.
        // A top-level conjunct: the output is empty on PR and queue runs.
        expect(ifLine, id).toMatch(
          /(?:^|\$\{\{ |&& )needs\.queue-verdict\.outputs\.tested != 'true' && \(/
        );
        // Queue verdict is SKIPPED on PR and queue runs; without a status
        // function a skipped need would skip this job too.
        expect(ifLine, id).toMatch(/always\(\)|!failure\(\) && !cancelled\(\)/);
      } else {
        // Inherits the skip: it needs `build`, which carries the queue-verdict
        // arm, so a queue-tested push skips `build` and with it this job.
        expect(needs, `${id} neither needs queue-verdict nor build`).toContain('build');
        // The implicit `success()` also looks at ANCESTORS, and queue-verdict
        // is skipped on every PR and queue run: it would skip this required
        // check (Codex, #4219). Each direct need is checked explicitly instead.
        expect(ifLine, id).toContain('!cancelled()');
        for (const need of needs) {
          expect(ifLine, `${id} does not check needs.${need}.result`).toContain(
            `needs.${need}.result == 'success'`
          );
        }
      }
    }
  });

  it('gives every job below queue-verdict a status function, so its skip never cascades', () => {
    for (const [id, header] of jobs()) {
      if (id === 'queue-verdict' || id === 'smoke-scope' || !/^ {4}needs:/m.test(header)) continue;
      const ifLine = header.match(/^ {4}if: (.*)$/m)?.[1] ?? '';
      expect(ifLine, `${id} relies on the implicit success()`).toMatch(/always\(\)|!cancelled\(\)/);
    }
  });

  it('gives merge-queue diffs a base, since the payload has no `before`', () => {
    for (const env of ['PUSH_BEFORE_SHA', 'GITHUB_EVENT_BEFORE', 'BASE_SHA']) {
      const lines = ci.split('\n').filter(l => l.trimStart().startsWith(`${env}:`));
      expect(lines.length, env).toBeGreaterThan(0);
      for (const line of lines) expect(line, env).toContain('github.event.merge_group.base_sha');
    }
  });

  it('mirrors from the queue base checkout, never the queue commit', () => {
    expect(mirrorWorkflow).toContain('ref: ${{ github.event.merge_group.base_sha }}');
    expect(mirrorWorkflow).not.toMatch(/ref:\s*\$\{\{\s*github\.event\.merge_group\.head/);
    expect(mirrorWorkflow).toContain('if: failure()');
  });
});
