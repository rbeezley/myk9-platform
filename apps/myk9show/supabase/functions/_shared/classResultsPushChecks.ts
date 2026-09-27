/**
 * MYK9-737: "Results Posted" pushes that are not getting through.
 *
 * A class is owed one push once it is due (done, visible, with a result to
 * announce). The classes trigger or the class-results-push-retry cron's sweep
 * queues it, push-trigger-scoring marks it sent after it has sent, and the
 * cron retries it until then (five attempts, then 'failed').
 *
 * This check reads `public.class_results_push_health()` (cron-health-check,
 * every run) and fails, naming the classes, when:
 *   - a push is still 'pending' 20+ minutes after it was queued;
 *   - a push ran out of attempts ('failed'; the cron prunes rows whose class
 *     is no longer due, so a failed row is always a class still owed a push);
 *   - the retry cron is not scheduled, not active, its latest run failed, or
 *     it has not succeeded for 15 minutes (three missed five-minute runs).
 *     Without it nothing retries and nothing sweeps. A due class with no row
 *     at all (it became due without a classes change) is queued by that
 *     sweep within five minutes, so the cron's liveness is what covers it.
 *
 * Deno-free and side-effect free, like its `systemHealthChecks.ts` siblings.
 */

import type { SnapshotCheck } from './systemHealthChecks.ts';

export const CLASS_RESULTS_PUSH_KEY = 'class_results_push';
export const RETRY_JOB_NAME = 'class-results-push-retry';
/** Three missed five-minute runs. */
export const RETRY_JOB_STALE_AFTER_MS = 15 * 60 * 1000;
const LABEL = 'Results Posted pushes';

interface StuckClass {
  className: string;
  showName: string | null;
  status: string;
  attempts: number | null;
  lastError: string | null;
}

function parseStuck(raw: unknown): StuckClass | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const className =
    typeof row.class_name === 'string' && row.class_name !== ''
      ? row.class_name
      : typeof row.class_id === 'string'
        ? `class ${row.class_id}`
        : null;
  if (!className || typeof row.status !== 'string') return null;
  return {
    className,
    showName: typeof row.show_name === 'string' ? row.show_name : null,
    status: row.status,
    attempts: typeof row.attempts === 'number' ? row.attempts : null,
    lastError: typeof row.last_error === 'string' ? row.last_error : null,
  };
}

function describe(stuck: StuckClass): string {
  const where = stuck.showName ? `${stuck.className} (${stuck.showName})` : stuck.className;
  const attempts = stuck.attempts === null ? '' : `, ${stuck.attempts} attempts`;
  const error = stuck.lastError ? `: ${stuck.lastError}` : '';
  return `${where} ${stuck.status}${attempts}${error}`;
}

/** What is wrong with the retry cron, or null when it is running. */
export function retryJobProblem(raw: unknown, nowMs: number): string | null {
  if (!raw || typeof raw !== 'object') return `${RETRY_JOB_NAME} was not reported`;
  const job = raw as Record<string, unknown>;
  if (job.scheduled !== true) return `${RETRY_JOB_NAME} is not scheduled`;
  if (job.active !== true) return `${RETRY_JOB_NAME} is not active`;
  if (job.last_status === 'failed') {
    const message = typeof job.last_message === 'string' ? `: ${job.last_message}` : '';
    return `${RETRY_JOB_NAME} last run failed${message}`;
  }
  const lastSuccess =
    typeof job.last_success_at === 'string' ? Date.parse(job.last_success_at) : Number.NaN;
  if (Number.isNaN(lastSuccess)) return `${RETRY_JOB_NAME} has no successful run recorded`;
  const minutes = Math.floor((nowMs - lastSuccess) / 60_000);
  if (nowMs - lastSuccess > RETRY_JOB_STALE_AFTER_MS) {
    return `${RETRY_JOB_NAME} last succeeded ${minutes} minutes ago`;
  }
  return null;
}

/**
 * `raw` is what `class_results_push_health()` returned —
 * `{ stuck, failed, pending, sample[], retry_job }` — or `{ error }`
 * when the RPC failed, or undefined when the runner did not ask.
 */
export function classResultsPushCheck(raw: unknown, checkedAt: string): SnapshotCheck {
  const base = { key: CLASS_RESULTS_PUSH_KEY, label: LABEL, checked_at: checkedAt };

  if (!raw || typeof raw !== 'object') {
    return {
      ...base,
      status: 'warn',
      detail: 'class_results_push_health was not reported',
      verification: 'unprovable',
    };
  }

  const facts = raw as Record<string, unknown>;
  if (typeof facts.error === 'string') {
    return {
      ...base,
      status: 'warn',
      detail: `class_results_push_health failed: ${facts.error}`,
      verification: 'unprovable',
    };
  }

  const stuck = facts.stuck;
  if (typeof stuck !== 'number' || !Number.isFinite(stuck)) {
    return {
      ...base,
      status: 'warn',
      detail: 'class_results_push_health returned an unreadable count',
      verification: 'unprovable',
    };
  }

  const problems: string[] = [];
  if (stuck > 0) {
    const sample = Array.isArray(facts.sample)
      ? facts.sample.map(parseStuck).filter((row): row is StuckClass => row !== null)
      : [];
    const named = sample.map(describe).join('; ');
    const more = stuck > sample.length ? `; and ${stuck - sample.length} more` : '';
    problems.push(
      `${stuck} ${stuck === 1 ? 'class has' : 'classes have'} not had their Results Posted push delivered` +
        (named ? `: ${named}${more}` : '')
    );
  }
  const jobProblem = retryJobProblem(facts.retry_job, Date.parse(checkedAt));
  if (jobProblem) problems.push(jobProblem);

  if (problems.length > 0) {
    return { ...base, status: 'fail', detail: problems.join('. '), delta_value: stuck };
  }

  const pending = typeof facts.pending === 'number' ? facts.pending : null;
  const inFlight = pending ? ` (${pending} pending, retrying)` : '';
  return {
    ...base,
    status: 'ok',
    detail: `no Results Posted push failed or pending past 20 minutes${inFlight}; ${RETRY_JOB_NAME} is running`,
    delta_value: 0,
  };
}
