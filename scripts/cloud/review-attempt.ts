/**
 * One cloud review attempt, as the reviewer job records it and the publisher
 * reads it back (MYK9-1398; docs/plan-cloud-agent-workflow.md Task 2.1).
 *
 * The outcome comes from the wrapper's own exit contract (the headers of
 * scripts/qa/claude-review.sh and codex-review.sh): 0 clean, 1 findings,
 * anything else not a verdict. This adds the job's view on top: a timeout, a
 * kill or a missing log is incomplete even if the wrapper exited 0. The
 * verdict text is never re-parsed here; post-review-gate.sh re-checks the log
 * before any evidence is written.
 *
 * The record crosses a trust boundary: the reviewer job ran a model over PR
 * content, so the publisher parses the artifact strictly and rejects anything
 * it does not recognize rather than ignoring it.
 */
import { createHash } from 'node:crypto';
import type { Harness } from './authorship.ts';

export type ReviewOutcome = 'clean' | 'findings' | 'incomplete';

export type WrapperResult = { exit: number | null; timedOut: boolean; log: Buffer | null };

export type ReviewAttempt = {
  repository: string;
  pr: number;
  baseSha: string;
  headSha: string;
  implementer: Harness;
  reviewer: Harness;
  /** GITHUB_SHA of the run: the base-branch commit whose workflow and wrapper ran. */
  workflowSha: string;
  runId: number;
  runAttempt: number;
  outcome: ReviewOutcome;
  wrapperExit: number | null;
  /** sha256 hex of the log, the same form post-review-gate.sh prints. */
  logDigest: string | null;
};

const EXIT_OUTCOME: Record<number, ReviewOutcome> = { 0: 'clean', 1: 'findings' };

export function outcomeFromWrapper(result: WrapperResult): ReviewOutcome {
  if (result.timedOut || result.exit === null || !result.log || result.log.length === 0) {
    return 'incomplete';
  }
  return EXIT_OUTCOME[result.exit] ?? 'incomplete';
}

export function buildReviewAttempt(
  input: Omit<ReviewAttempt, 'outcome' | 'wrapperExit' | 'logDigest'> & { wrapper: WrapperResult }
): ReviewAttempt {
  const { wrapper, ...identity } = input;
  const log = wrapper.log && wrapper.log.length > 0 ? wrapper.log : null;
  return {
    ...identity,
    outcome: outcomeFromWrapper(wrapper),
    wrapperExit: wrapper.exit,
    logDigest: log ? createHash('sha256').update(log).digest('hex') : null,
  };
}

const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const HARNESSES: readonly unknown[] = ['claude', 'codex'];
const OUTCOMES: readonly unknown[] = ['clean', 'findings', 'incomplete'];

type Check = (v: unknown) => boolean;
const positiveInt: Check = v => Number.isSafeInteger(v) && (v as number) > 0;
const matches =
  (pattern: RegExp): Check =>
  v =>
    typeof v === 'string' && pattern.test(v);

const FIELDS: Record<keyof ReviewAttempt, Check> = {
  repository: matches(REPOSITORY),
  pr: positiveInt,
  baseSha: matches(SHA),
  headSha: matches(SHA),
  implementer: v => HARNESSES.includes(v),
  reviewer: v => HARNESSES.includes(v),
  workflowSha: matches(SHA),
  runId: positiveInt,
  runAttempt: positiveInt,
  outcome: v => OUTCOMES.includes(v),
  wrapperExit: v => v === null || Number.isSafeInteger(v),
  logDigest: v => v === null || matches(DIGEST)(v),
};

export function parseReviewAttempt(value: unknown): ReviewAttempt | { invalid: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { invalid: 'not an object' };
  }
  const record = value as Record<string, unknown>;
  const extra = Object.keys(record).filter(k => !(k in FIELDS));
  if (extra.length > 0) return { invalid: `unexpected field(s): ${extra.join(', ')}` };
  for (const [key, check] of Object.entries(FIELDS)) {
    if (!(key in record)) return { invalid: `missing field: ${key}` };
    if (!check(record[key])) return { invalid: `malformed field: ${key}` };
  }
  const attempt = record as ReviewAttempt;
  if (attempt.reviewer === attempt.implementer) {
    return { invalid: `${attempt.reviewer} cannot review its own work` };
  }
  // A verdict needs the log it came from and the exit that reported it.
  if (attempt.outcome !== 'incomplete') {
    if (attempt.logDigest === null) return { invalid: `${attempt.outcome} outcome with no log` };
    if (EXIT_OUTCOME[attempt.wrapperExit ?? -1] !== attempt.outcome) {
      return { invalid: `${attempt.outcome} outcome from wrapper exit ${attempt.wrapperExit}` };
    }
  }
  return attempt;
}
