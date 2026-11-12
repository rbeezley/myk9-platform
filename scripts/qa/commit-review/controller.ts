/**
 * Nightly commit review controller (MYK9-1891).
 *
 * Owns the loop the worker kept abandoning: take the lock, find or create the
 * frozen run, then validate -> launch/resume a worker -> validate until the
 * record says complete or a real blocker is reached. It never reviews, files,
 * writes the report or stamps the cursor itself; the worker does that, and the
 * record (validated from git, not from worker prose) decides what happens next.
 */
import { existsSync, readdirSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { runAttempt, tail } from './attempt';
import { acquireLock, type LockIdentity } from './lock';
import { BOUNDARY_PATH, publishCheck } from './publish';
import { createRecord, makeGit, readBoundaryFromSha } from './record';
import {
  DEFAULT_RUNS_DIR,
  isRecordShape,
  readRecordRaw,
  recordPath,
  writeRecordAtomic,
} from './store';
import type { GitFn, Outcome, RunRecord } from './types';
import { validateRecord } from './validate';
import { realLaunchWorker, type LaunchWorker } from './worker';

export type { LaunchWorker } from './worker';

export const PAUSE_FILE = 'PAUSE';
export const EXIT = { complete: 0, blocked: 1, paused: 2, locked: 3 } as const;

export interface ControllerOptions {
  runsDir: string;
  git: GitFn;
  launchWorker: LaunchWorker;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  lock: LockIdentity;
  log: (line: string) => void;
  /** Per invocation, so a later night is never locked out by an earlier blocker. */
  maxAttempts?: number;
  maxNoProgress?: number;
  backoffMs?: number[];
  heartbeatMs?: number;
}

export interface Blocker {
  operation: string;
  error: string;
  attempts: number;
  recoveryAttempts: string[];
  remainingShas: string[];
  nextAction: string;
}

export interface RunResult {
  status: 'complete' | 'complete-empty' | 'blocked' | 'paused' | 'locked';
  exitCode: number;
  summary: string;
  recordPath?: string;
  outcome?: Outcome;
  blocker?: Blocker;
}

const DEFAULT_BACKOFF = [30_000, 120_000, 300_000];

function readCursor(git: GitFn): string {
  git(['fetch', 'origin', 'main']);
  return readBoundaryFromSha(git(['show', `origin/main:${BOUNDARY_PATH}`]));
}

interface OpenRecord {
  path: string;
  record: RunRecord;
}

/** Every unfinished record, whatever cursor it was frozen from, newest first. */
function findOpenRecords(runsDir: string, git: GitFn): OpenRecord[] {
  if (!existsSync(runsDir)) return [];
  const open: OpenRecord[] = [];
  for (const f of readdirSync(runsDir).filter(n => n.endsWith('.json'))) {
    const path = join(runsDir, f);
    let raw: unknown;
    try {
      raw = readRecordRaw(path);
    } catch {
      continue;
    }
    if (!isRecordShape(raw)) continue;
    const kind = validateRecord(raw, git).outcome;
    if (kind !== 'complete' && kind !== 'complete-empty') open.push({ path, record: raw });
  }
  return open.sort((a, b) => b.record.createdAt.localeCompare(a.record.createdAt));
}

/**
 * A run whose commits are all reviewed and whose report and cursor are already
 * on origin/main only lacks the readback note (the controller stopped between
 * the push and recording it). Record it; never publish again.
 */
function reconcilePublished(open: OpenRecord[], git: GitFn, log: (s: string) => void): void {
  for (const o of open) {
    const out = validateRecord(o.record, git);
    if (out.outcome !== 'incomplete' || out.remainingShas.length) continue;
    if (!publishCheck(o.record, git).ok) continue;
    log(`Run ${o.record.runId} is already published on origin/main; recording readback-ok.`);
    save(o.path, r => {
      r.publication = { ...r.publication, state: 'readback-ok' };
    });
  }
}

function blockedResult(
  path: string | undefined,
  outcome: Outcome | undefined,
  b: Blocker
): RunResult {
  return {
    status: 'blocked',
    exitCode: EXIT.blocked,
    recordPath: path,
    outcome,
    blocker: b,
    summary:
      `BLOCKED: ${b.operation} failed: ${b.error}. ` +
      `Recovery attempts: ${b.recoveryAttempts.length ? b.recoveryAttempts.join('; ') : 'none'}. ` +
      `Unreviewed SHAs (${b.remainingShas.length}): ${b.remainingShas.join(' ') || 'none'}. ` +
      `Next action: ${b.nextAction}`,
  };
}

function save(path: string, mutate: (r: RunRecord) => void): void {
  const r = readRecordRaw(path) as RunRecord;
  mutate(r);
  writeRecordAtomic(path, r);
}

export async function runController(opts: ControllerOptions): Promise<RunResult> {
  const { runsDir, log } = opts;
  const maxAttempts = opts.maxAttempts ?? 12;
  const maxNoProgress = opts.maxNoProgress ?? 3;
  const backoff = opts.backoffMs ?? DEFAULT_BACKOFF;
  const paused = (path?: string): RunResult => ({
    status: 'paused',
    exitCode: EXIT.paused,
    recordPath: path,
    summary: `PAUSED by owner: ${join(runsDir, PAUSE_FILE)} exists. Nothing was launched or changed. Delete it to resume.`,
  });

  if (existsSync(join(runsDir, PAUSE_FILE))) return paused();

  const got = acquireLock(runsDir, { ...opts.lock, now: opts.now });
  if (!got.ok) {
    const h = got.holder;
    return {
      status: 'locked',
      exitCode: EXIT.locked,
      summary: `Another controller owns this run (pid ${h?.pid ?? '?'} on ${h?.host ?? '?'}, heartbeat ${h?.heartbeatAt ?? '?'}). Nothing launched; no duplicate dispatch.`,
    };
  }
  if (got.tookOver)
    log(
      `Recovered stale lock from pid ${got.tookOver.pid} on ${got.tookOver.host} (last heartbeat ${got.tookOver.heartbeatAt}).`
    );
  const timer = setInterval(() => got.lock.heartbeat(), opts.heartbeatMs ?? 60_000);
  timer.unref();
  try {
    return await drive(
      opts,
      maxAttempts,
      maxNoProgress,
      backoff,
      () => got.lock.heartbeat(),
      paused
    );
  } finally {
    clearInterval(timer);
    got.lock.release();
  }
}

async function drive(
  opts: ControllerOptions,
  maxAttempts: number,
  maxNoProgress: number,
  backoff: number[],
  heartbeat: () => void,
  paused: (path?: string) => RunResult
): Promise<RunResult> {
  const { runsDir, git, log } = opts;
  let path: string | undefined;
  const attemptsMade: string[] = [];
  const block = (
    operation: string,
    error: string,
    o: Outcome | undefined,
    next: string
  ): RunResult =>
    blockedResult(path, o, {
      operation,
      error,
      attempts: attemptsMade.length,
      recoveryAttempts: attemptsMade,
      remainingShas: o?.remainingShas ?? [],
      nextAction: next,
    });

  try {
    const cursor = readCursor(git);
    reconcilePublished(findOpenRecords(runsDir, git), git, log);
    const open = findOpenRecords(runsDir, git);
    const superseded = open.filter(o => o.record.boundary.fromSha !== cursor);
    if (superseded.length) {
      const first = superseded[0] as OpenRecord;
      path = first.path;
      const o = validateRecord(first.record, git);
      return block(
        'reconcile an unfinished run with the shared cursor',
        `run ${first.record.runId} was frozen from ${first.record.boundary.fromSha} but the audit-boundary cursor on origin/main is ${cursor}, and the run is not published (${superseded.length} such run(s))`,
        o,
        'Another stream advanced the cursor. Decide whether the run is superseded, then move its record out of the runs directory; the next run freezes a fresh window.'
      );
    }
    path = open[0]?.path;
    if (path) log(`Resuming frozen run ${path}`);
    else {
      const to = git(['rev-parse', '--verify', 'origin/main^{commit}']);
      const rec = createRecord(cursor, to, git, opts.now());
      path = recordPath(runsDir, rec.runId);
      writeRecordAtomic(path, rec);
      log(`Started frozen run ${rec.runId}: ${cursor}..${to} (${rec.inventory.length} commits)`);
    }
  } catch (err) {
    return block(
      'read the cursor and freeze the target on origin/main',
      (err as Error).message,
      undefined,
      'Fix git access to origin/main, then rerun `pnpm qa:commit-review:run`.'
    );
  }

  let streak = 0;
  let launched = 0;
  for (;;) {
    const outcome = validateRecord(readRecordRaw(path), git);
    if (outcome.outcome === 'complete' || outcome.outcome === 'complete-empty') {
      return {
        status: outcome.outcome,
        exitCode: EXIT.complete,
        recordPath: path,
        outcome,
        summary:
          `${outcome.outcome.toUpperCase()}: ${outcome.reviewed}/${outcome.total} commits reviewed through ${outcome.targetSha}; ` +
          `publication ${outcome.publication?.state}; issues ${outcome.issueRefs.join(', ') || 'none'}.`,
      };
    }
    if (outcome.outcome === 'blocked') {
      return block(
        'validate the run record',
        outcome.reasons.join('; '),
        outcome,
        'Fix the record problem named above (never by hand-marking commits), then rerun.'
      );
    }
    if (existsSync(join(runsDir, PAUSE_FILE))) return paused(path);

    const rec = readRecordRaw(path) as RunRecord;
    if (outcome.remainingShas.length === 0) {
      const check = publishCheck(rec, git);
      if (check.ok) {
        log(
          `Report and cursor read back on origin/main (${check.reportPath}); recording readback-ok.`
        );
        save(path, r => {
          r.publication = { ...r.publication, state: 'readback-ok' };
        });
        continue;
      }
      log(`Publication not on origin/main yet: ${check.reasons.join('; ')}`);
    } else {
      try {
        const cursor = readCursor(git);
        if (cursor !== rec.boundary.fromSha)
          return block(
            'confirm the shared cursor is unchanged',
            `the audit-boundary row moved from ${rec.boundary.fromSha} to ${cursor} while this run was unfinished`,
            outcome,
            'Another stream (Claude failover or a manual run) advanced the cursor. Review whether this frozen run is superseded, then rerun to freeze a fresh window.'
          );
      } catch (err) {
        log(
          `Could not recheck the cursor (${(err as Error).message}); continuing from the frozen record.`
        );
      }
    }

    if (launched >= maxAttempts)
      return block(
        'resume the review worker',
        `attempt limit of ${maxAttempts} reached for this invocation with work left`,
        outcome,
        'Rerun `pnpm qa:commit-review:run` to continue the same frozen run, or raise --max-attempts.'
      );
    if (streak >= maxNoProgress)
      return block(
        'resume the review worker',
        `no progress in ${streak} consecutive attempts`,
        outcome,
        'Open the last Codex session for this run and read why it stops; fix that, then rerun.'
      );

    heartbeat();
    launched++;
    const att = await runAttempt(opts, path, rec, outcome);
    heartbeat();
    const { attempt, result, afterOutcome, progressed, failure, classification, before, after } =
      att;
    attemptsMade.push(
      `attempt ${attempt.n}: exit ${result.exitCode}, ${before.reviewed}->${after.reviewed} reviewed, ${classification}`
    );

    if (failure === 'permanent')
      return block(
        'codex exec (review worker)',
        tail(result.stderr) || `exit ${result.exitCode}`,
        afterOutcome,
        'Fix the permanent error above (login, install, instructions file), then rerun.'
      );

    streak = progressed ? 0 : streak + 1;
    const needsBackoff = result.exitCode !== 0 || !progressed;
    if (
      needsBackoff &&
      afterOutcome.outcome !== 'complete' &&
      afterOutcome.outcome !== 'complete-empty'
    ) {
      if (streak >= maxNoProgress) continue;
      const ms = backoff[Math.min(Math.max(streak, 1) - 1, backoff.length - 1)] ?? 30_000;
      log(`Attempt ${attempt.n} ${classification}; waiting ${ms / 1000}s before resuming.`);
      await opts.sleep(ms);
    }
  }
}

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

export function buildRuntimeOptions(args: string[]): ControllerOptions {
  const runsDir = flagValue(args, 'dir') ?? DEFAULT_RUNS_DIR;
  const repoDir = flagValue(args, 'repo') ?? process.cwd();
  const instructionsFile =
    flagValue(args, 'instructions-file') ?? join(runsDir, '..', 'worker-instructions.md');
  const num = (n: string): number | undefined =>
    flagValue(args, n) ? Number(flagValue(args, n)) : undefined;
  const extraArgs = (process.env.COMMIT_REVIEW_CODEX_ARGS ?? '').split(/\s+/).filter(Boolean);
  return {
    runsDir,
    git: makeGit(repoDir),
    launchWorker: realLaunchWorker({ repoDir, instructionsFile, extraArgs }),
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    now: () => new Date(),
    lock: {
      pid: process.pid,
      host: hostname(),
      isPidAlive: pid => {
        try {
          process.kill(pid, 0);
          return true;
        } catch (err) {
          return (err as NodeJS.ErrnoException).code === 'EPERM';
        }
      },
      staleMs: (num('stale-minutes') ?? 15) * 60_000,
    },
    log: line => console.error(`[commit-review] ${line}`),
    maxAttempts: num('max-attempts'),
    maxNoProgress: num('max-no-progress'),
  };
}

export async function runControllerMain(args: string[]): Promise<number> {
  const result = await runController(buildRuntimeOptions(args));
  console.log(
    JSON.stringify(
      {
        status: result.status,
        exitCode: result.exitCode,
        recordPath: result.recordPath,
        blocker: result.blocker,
        outcome: result.outcome,
      },
      null,
      2
    )
  );
  console.log(result.summary);
  return result.exitCode;
}
