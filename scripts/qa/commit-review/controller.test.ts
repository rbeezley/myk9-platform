import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from './cli';
import { runController, type ControllerOptions, type LaunchWorker } from './controller';
import { acquireLock } from './lock';
import { publishCheck } from './publish';
import { readRecordRaw } from './store';
import type { GitFn, RunRecord } from './types';

const sha = (n: number) => String(n).padStart(40, 'a');
const FROM = sha(100);
const TO = sha(200);
const inv = (n: number) => Array.from({ length: n }, (_, i) => sha(i + 1));
const T0 = new Date('2026-11-12T10:00:00Z');

interface Origin {
  rowSha: string;
  reports: Record<string, string>;
  fetches: number;
}

function makeGit(n: number, origin: Origin): GitFn {
  const boundary = () =>
    `| \`daily-commit-review\` | \`${origin.rowSha}\` | 2026-11-11T00:05:32Z | codex-daily-commit-review | 2026-11-11 |`;
  return args => {
    const [cmd, ...rest] = args;
    if (cmd === 'fetch') {
      origin.fetches++;
      return '';
    }
    if (cmd === 'rev-parse') {
      const ref = (rest[1] ?? '').replace('^{commit}', '');
      return ref === 'origin/main' ? TO : ref;
    }
    if (cmd === 'rev-list') return inv(n).join('\n');
    if (cmd === 'show') {
      const spec = rest[0] ?? '';
      const path = spec.replace('origin/main:', '');
      if (path === 'docs/qa/audit-boundary.md') return boundary();
      const body = origin.reports[path];
      if (body === undefined) throw new Error(`fatal: path '${path}' does not exist`);
      return body;
    }
    if (cmd === 'merge-base') {
      // --is-ancestor <a> <b>: true only for a === b-or-older in this fake.
      if ((rest[1] ?? '') <= (rest[2] ?? '')) return '';
      throw new Error('not ancestor');
    }
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
}

interface Step {
  review?: number;
  exit?: number;
  stderr?: string;
  sessionId?: string;
  publish?: boolean;
}

let dir: string;
let origin: Origin;
let sleeps: number[];
let calls: Array<Parameters<LaunchWorker>[0]>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'controller-'));
  origin = { rowSha: FROM, reports: {}, fetches: 0 };
  sleeps = [];
  calls = [];
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A worker that behaves like the real one: uses the CLI to mark commits reviewed. */
function scriptedWorker(steps: Step[]): LaunchWorker {
  let i = 0;
  return req => {
    calls.push(req);
    const step = steps[Math.min(i, steps.length - 1)] ?? {};
    i++;
    req.remainingShas.slice(0, step.review ?? 0).forEach(s => {
      runCli(
        ['mark-reviewed', '--record', req.recordPath, '--sha', s, '--evidence', 'read it'],
        gitFor(3),
        () => {}
      );
    });
    if (step.publish) {
      origin.rowSha = TO;
      origin.reports['docs/qa/codex-daily-commit-review-2026-11-12.md'] = `target ${TO}`;
    }
    return Promise.resolve({
      exitCode: step.exit ?? 0,
      sessionId: step.sessionId ?? 'sess-1',
      stderr: step.stderr ?? '',
    });
  };
}

let gitN = 3;
const gitFor = (n: number) => makeGit(n, origin);

function options(worker: LaunchWorker, extra: Partial<ControllerOptions> = {}): ControllerOptions {
  return {
    runsDir: dir,
    git: makeGit(gitN, origin),
    launchWorker: worker,
    sleep: ms => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    now: () => T0,
    lock: { pid: 111, host: 'h', isPidAlive: () => false, staleMs: 900_000 },
    log: () => {},
    ...extra,
  };
}

function records(): string[] {
  return readdirSync(dir).filter(f => f.endsWith('.json'));
}
function load(): RunRecord {
  return readRecordRaw(join(dir, records()[0] as string)) as RunRecord;
}

describe('runController: early exit continuation without an owner', () => {
  it('resumes after an exit at 0/N and finishes the same frozen run', async () => {
    gitN = 3;
    const worker = scriptedWorker([
      { review: 0, sessionId: 's-a' },
      { review: 3, sessionId: 's-a' },
      { publish: true, sessionId: 's-a' },
    ]);
    const res = await runController(options(worker));
    expect(res.status).toBe('complete');
    expect(res.exitCode).toBe(0);
    expect(records()).toHaveLength(1);
    expect(calls).toHaveLength(3);
    expect(calls[0]?.remainingShas).toEqual(inv(3));
    expect(calls[0]?.sessionId).toBeUndefined();
    expect(calls[1]?.sessionId).toBe('s-a');
    expect(calls[2]?.publicationOnly).toBe(true);
    expect(load().boundary.toSha).toBe(TO);
    expect(load().controller?.attempts).toHaveLength(3);
  });

  it('resumes after a partial exit with only the remaining SHAs', async () => {
    gitN = 5;
    const worker = scriptedWorker([{ review: 2 }, { review: 3 }, { publish: true }]);
    const res = await runController(options(worker));
    expect(res.status).toBe('complete');
    expect(calls[1]?.remainingShas).toEqual(inv(5).slice(2));
    expect(sleeps).toEqual([]);
  });

  it('backs off after a no-progress attempt and never busy loops', async () => {
    gitN = 3;
    const worker = scriptedWorker([{ review: 0 }, { review: 0 }, { review: 3 }, { publish: true }]);
    await runController(options(worker));
    expect(sleeps).toEqual([30_000, 120_000]);
  });
});

describe('runController: crash and restart', () => {
  it('a second invocation resumes the same record and session', async () => {
    gitN = 3;
    const first = scriptedWorker([{ review: 1, sessionId: 's-z' }]);
    const res1 = await runController(options(first, { maxAttempts: 1 }));
    expect(res1.status).toBe('blocked');
    const second = scriptedWorker([{ review: 2 }, { publish: true }]);
    const res2 = await runController(options(second, { maxAttempts: 5 }));
    expect(res2.status).toBe('complete');
    expect(records()).toHaveLength(1);
    expect(calls[1]?.sessionId).toBe('s-z');
    expect(calls[1]?.remainingShas).toEqual(inv(3).slice(1));
    expect(load().controller?.attempts).toHaveLength(3);
  });

  it('a finished run is not resumed; a fresh window gets its own record', async () => {
    gitN = 2;
    await runController(options(scriptedWorker([{ review: 2 }, { publish: true }])));
    calls.length = 0;
    // cursor on origin advanced to TO; boundary now equals the target, so a new empty window
    const res = await runController(options(scriptedWorker([{ publish: true }])));
    expect(res.status).toBe('complete-empty');
    expect(records()).toHaveLength(2);
  });
});

describe('runController: lock', () => {
  it('blocks a duplicate dispatch while a live controller holds the lock', async () => {
    const held = acquireLock(dir, { ...options(scriptedWorker([])).lock, now: () => T0 });
    expect(held.ok).toBe(true);
    const worker = scriptedWorker([{ review: 3 }]);
    const res = await runController(
      options(worker, { lock: { pid: 222, host: 'h', isPidAlive: () => true, staleMs: 900_000 } })
    );
    expect(res.status).toBe('locked');
    expect(res.exitCode).toBe(3);
    expect(calls).toHaveLength(0);
    expect(records()).toHaveLength(0);
  });

  it('takes over a stale lock (old heartbeat, dead pid) and says so', async () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'controller.lock'),
      JSON.stringify({
        pid: 999,
        host: 'h',
        startedAt: '2026-11-12T01:00:00Z',
        heartbeatAt: '2026-11-12T01:00:00Z',
      })
    );
    const logs: string[] = [];
    gitN = 1;
    const res = await runController(
      options(scriptedWorker([{ review: 1 }, { publish: true }]), { log: s => logs.push(s) })
    );
    expect(res.status).toBe('complete');
    expect(logs.join('\n')).toMatch(/stale lock/i);
    expect(existsSync(join(dir, 'controller.lock'))).toBe(false);
  });

  it('does not take over a lock with an old heartbeat when its pid is alive', () => {
    writeFileSync(
      join(dir, 'controller.lock'),
      JSON.stringify({
        pid: 999,
        host: 'h',
        startedAt: '2026-11-12T01:00:00Z',
        heartbeatAt: '2026-11-12T01:00:00Z',
      })
    );
    const r = acquireLock(dir, {
      now: () => T0,
      pid: 1,
      host: 'h',
      isPidAlive: () => true,
      staleMs: 900_000,
    });
    expect(r.ok).toBe(false);
  });

  it('does not take over a fresh heartbeat even if the pid looks dead', () => {
    writeFileSync(
      join(dir, 'controller.lock'),
      JSON.stringify({
        pid: 999,
        host: 'h',
        startedAt: '2026-11-12T09:59:00Z',
        heartbeatAt: '2026-11-12T09:59:30Z',
      })
    );
    const r = acquireLock(dir, {
      now: () => T0,
      pid: 1,
      host: 'h',
      isPidAlive: () => false,
      staleMs: 900_000,
    });
    expect(r.ok).toBe(false);
  });
});

describe('runController: pause and failures', () => {
  it('honors PAUSE before launching and leaves the record untouched', async () => {
    gitN = 3;
    await runController(options(scriptedWorker([{ review: 1 }]), { maxAttempts: 1 }));
    const before = JSON.stringify(load());
    writeFileSync(join(dir, 'PAUSE'), '');
    calls.length = 0;
    const res = await runController(options(scriptedWorker([{ review: 3 }])));
    expect(res.status).toBe('paused');
    expect(res.exitCode).toBe(2);
    expect(calls).toHaveLength(0);
    expect(JSON.stringify(load())).toBe(before);
  });

  it('honors PAUSE between attempts', async () => {
    gitN = 3;
    const inner = scriptedWorker([{ review: 1 }]);
    const worker: LaunchWorker = async req => {
      writeFileSync(join(dir, 'PAUSE'), '');
      return inner(req);
    };
    const res = await runController(options(worker));
    expect(res.status).toBe('paused');
    expect(calls).toHaveLength(1);
  });

  it('treats an auth error as permanent and blocks at once with a full report', async () => {
    gitN = 3;
    const res = await runController(
      options(scriptedWorker([{ exit: 1, stderr: 'Error: not logged in, please run codex login' }]))
    );
    expect(res.status).toBe('blocked');
    expect(calls).toHaveLength(1);
    expect(res.blocker).toMatchObject({
      operation: expect.stringContaining('codex exec'),
      error: expect.stringContaining('not logged in'),
      remainingShas: inv(3),
      nextAction: expect.any(String),
    });
    expect(res.blocker?.attempts).toBe(1);
  });

  it('retries a transient failure with bounded backoff and then succeeds', async () => {
    gitN = 3;
    const worker = scriptedWorker([
      { exit: 1, stderr: 'stream disconnected, connection reset' },
      { exit: 1, stderr: 'ETIMEDOUT' },
      { review: 3 },
      { publish: true },
    ]);
    const res = await runController(options(worker));
    expect(res.status).toBe('complete');
    expect(sleeps).toEqual([30_000, 120_000]);
  });

  it('blocks after K consecutive attempts with no progress', async () => {
    gitN = 3;
    const res = await runController(options(scriptedWorker([{ review: 0 }])));
    expect(res.status).toBe('blocked');
    expect(calls).toHaveLength(3);
    expect(res.blocker?.error).toMatch(/no progress/i);
    expect(res.blocker?.remainingShas).toEqual(inv(3));
  });

  it('reports a bounded attempt limit with the remaining SHAs, never silently', async () => {
    gitN = 20;
    const res = await runController(options(scriptedWorker([{ review: 1 }]), { maxAttempts: 4 }));
    expect(res.status).toBe('blocked');
    expect(calls).toHaveLength(4);
    expect(res.blocker?.error).toMatch(/attempt limit/i);
    expect(res.blocker?.remainingShas).toEqual(inv(20).slice(4));
  });
});

describe('publication readback', () => {
  const REPORT = 'docs/qa/codex-daily-commit-review-2026-11-12.md';
  function rec(): RunRecord {
    return { boundary: { fromSha: FROM, toSha: TO }, runId: '2026-11-12-abcd1234' } as RunRecord;
  }

  it('fails until both files on origin/main carry the target SHA', () => {
    const git = makeGit(3, origin);
    expect(publishCheck(rec(), git).ok).toBe(false);
    origin.reports[REPORT] = `target ${TO}`;
    expect(publishCheck(rec(), git).ok).toBe(false);
    origin.rowSha = TO;
    expect(publishCheck(rec(), git)).toMatchObject({ ok: true });
  });

  it('accepts a newer stamp (target is an ancestor of the cursor)', () => {
    origin.reports[REPORT] = `target ${TO}`;
    origin.rowSha = sha(300);
    expect(publishCheck(rec(), makeGit(3, origin)).ok).toBe(true);
  });

  it('does not ask the worker to publish again when origin already has both files', async () => {
    gitN = 2;
    origin.rowSha = FROM;
    const worker = scriptedWorker([{ review: 2, publish: true }]);
    const res = await runController(options(worker));
    expect(res.status).toBe('complete');
    expect(calls).toHaveLength(1);
  });

  it('publish-check --apply sets readback-ok once and is a no-op afterwards', async () => {
    gitN = 1;
    await runController(options(scriptedWorker([{ review: 1 }]), { maxAttempts: 1 }));
    const path = join(dir, records()[0] as string);
    origin.reports[REPORT] = `target ${TO}`;
    origin.rowSha = TO;
    const out: string[] = [];
    expect(
      runCli(['publish-check', '--record', path, '--apply'], makeGit(1, origin), s => out.push(s))
    ).toBe(0);
    expect(load().publication.state).toBe('readback-ok');
    expect(
      runCli(['publish-check', '--record', path, '--apply'], makeGit(1, origin), s => out.push(s))
    ).toBe(0);
    expect(out.join('')).toContain('already');
  });
});
