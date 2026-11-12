import { publishCheck } from './publish';
import { readRecordRaw, writeRecordAtomic } from './store';
import type { Attempt, GitFn, Outcome, RunRecord } from './types';
import { validateRecord } from './validate';
import { classifyFailure, type LaunchWorker, type WorkerResult } from './worker';

export interface Metrics {
  reviewed: number;
  prefix: number;
  pub: number;
}

export function metrics(o: Outcome): Metrics {
  const pub = ['pending', 'committed', 'pushed', 'readback-ok'].indexOf(o.publication?.state ?? '');
  return { reviewed: o.reviewed, prefix: o.contiguousReviewedPrefix.count, pub };
}

const tail = (s: string): string =>
  s.trim().length > 1500 ? `...${s.trim().slice(-1500)}` : s.trim();

export interface AttemptReport {
  attempt: Attempt;
  result: WorkerResult;
  afterOutcome: Outcome;
  progressed: boolean;
  failure: 'ok' | 'transient' | 'permanent';
  classification: Attempt['classification'];
  before: Metrics;
  after: Metrics;
}

/** One worker launch, judged by the record on disk rather than by worker prose. */
export async function runAttempt(
  deps: { git: GitFn; launchWorker: LaunchWorker; now: () => Date },
  path: string,
  rec: RunRecord,
  outcome: Outcome
): Promise<AttemptReport> {
  const { git } = deps;
  const before = metrics(outcome);
  const startedAt = deps.now().toISOString();
  const sessionId = rec.controller?.sessionId;
  let result: WorkerResult;
  try {
    result = await deps.launchWorker({
      recordPath: path,
      remainingShas: outcome.remainingShas,
      sessionId,
      publicationOnly: outcome.remainingShas.length === 0,
    });
  } catch (err) {
    result = { exitCode: 127, stderr: `launch failed: ${(err as Error).message}`, sessionId };
  }
  const afterOutcome = validateRecord(readRecordRaw(path), git);
  const after = metrics(afterOutcome);
  // A publication-only attempt progressed if the report and cursor now read back.
  const published =
    afterOutcome.remainingShas.length === 0 &&
    publishCheck(readRecordRaw(path) as RunRecord, git).ok;
  const progressed =
    after.reviewed > before.reviewed ||
    after.prefix > before.prefix ||
    after.pub > before.pub ||
    published;
  const failure = classifyFailure(result.exitCode, result.stderr);
  const classification =
    failure === 'permanent'
      ? 'permanent'
      : result.exitCode !== 0
        ? 'transient'
        : progressed
          ? 'ok'
          : 'no-progress';
  const attempt: Attempt = {
    n: (rec.controller?.attempts.length ?? 0) + 1,
    startedAt,
    endedAt: deps.now().toISOString(),
    exitCode: result.exitCode,
    sessionId: result.sessionId,
    reviewedBefore: before.reviewed,
    reviewedAfter: after.reviewed,
    prefixBefore: before.prefix,
    prefixAfter: after.prefix,
    classification,
    error: result.stderr ? tail(result.stderr) : undefined,
  };
  const fresh = readRecordRaw(path) as RunRecord;
  fresh.controller = {
    sessionId: result.sessionId ?? fresh.controller?.sessionId,
    attempts: [...(fresh.controller?.attempts ?? []), attempt],
  };
  writeRecordAtomic(path, fresh);
  return { attempt, result, afterOutcome, progressed, failure, classification, before, after };
}

export { tail };
