/**
 * Pure logic for the daily System Health check-runner (cron-health-check).
 *
 * `buildSnapshot()` turns the raw facts from `public.system_health_probe()` into
 * the exact row the `/admin/health` board reads: `{ source, overall_status,
 * checks[], run_duration_ms }`, where `overall_status` is the WORST of the
 * individual check statuses. It is deliberately side-effect free and Deno-free
 * (no `npm:`/Deno imports) so it runs under the app's vitest, like the sibling
 * `_shared/payoutCalc.ts`. The edge function does all the IO.
 *
 * Like the board's parser, nothing here throws on malformed input: a bad facts
 * payload must degrade to a visible `fail`, never crash the runner (which would
 * write no row, leaving the board to age silently into staleness).
 *
 * The check `status` strings and the worst-of fold are value-sensitive — the
 * board maps them straight to green/amber/red and to its "stale = fail" rule —
 * so they are covered assertion-first in systemHealthChecks.test.ts.
 */

export type HealthStatus = 'ok' | 'warn' | 'fail';

/** One check as stored in the snapshot's `checks` JSONB (snake_case keys — the
 * board's parser reads `entry.checked_at`). */
export interface SnapshotCheck {
  key: string;
  label: string;
  status: HealthStatus;
  detail: string;
  checked_at: string | null;
}

/** The row the runner inserts into `public.system_health_snapshots`. */
export interface HealthSnapshotInsert {
  source: string;
  overall_status: HealthStatus;
  checks: SnapshotCheck[];
  run_duration_ms: number | null;
}

/** Raw job entry as returned inside the probe's `cron_jobs` array. */
export interface RawCronJob {
  jobname?: unknown;
  active?: unknown;
  /** True when the job's command dispatches an Edge Function via net.http_post
   * (so pg_cron 'succeeded' means "request enqueued", not "function returned 2xx"). */
  dispatches_http?: unknown;
  last_status?: unknown;
  last_start?: unknown;
  last_end?: unknown;
  last_message?: unknown;
}

/** Raw facts object returned by `system_health_probe()`. */
export interface RawProbeFacts {
  probed_at?: unknown;
  latest_migration?: unknown;
  migration_count?: unknown;
  cron_jobs?: unknown;
}

export interface BuildSnapshotOptions {
  /** Current time in epoch ms — explicit for deterministic tests. */
  now: number;
  /** `source` column value; defaults to `DEFAULT_SOURCE`. */
  source?: string;
  /** Measured wall time of the run, or null. */
  runDurationMs?: number | null;
  /** Overrides the staleness threshold (mostly for tests). */
  staleAfterMs?: number;
}

// Match the board's STALE_AFTER_MS (systemHealthSelectors.ts) so a run the board
// would call stale is the same window the runner uses to warn on an overdue job.
export const STALE_AFTER_MS = 26 * 60 * 60 * 1000; // ~26 hours
export const PAYOUT_CRON_JOB = 'nightly-show-payouts';
export const DEFAULT_SOURCE = 'cron-health-check';

const RANK: Record<HealthStatus, number> = { ok: 0, warn: 1, fail: 2 };

/** Worst (highest-severity) status across a set; empty set is `ok`. */
export function worstOf(statuses: HealthStatus[]): HealthStatus {
  return statuses.reduce<HealthStatus>((worst, s) => (RANK[s] > RANK[worst] ? s : worst), 'ok');
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asIsoOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function isoNow(now: number): string {
  return new Date(now).toISOString();
}

/** Trim a (possibly multi-line) Postgres error message to a single short line. */
function firstLine(message: string): string {
  const line = message.split('\n')[0].trim();
  return line.length > 200 ? `${line.slice(0, 197)}...` : line;
}

interface CronJob {
  jobname: string;
  active: boolean;
  /** True when the job dispatches an Edge Function via net.http_post. */
  dispatchesHttp: boolean;
  lastStatus: string | null;
  /** last_end, or last_start if the run never finished, or null if never ran. */
  lastRunAt: string | null;
  lastMessage: string | null;
}

function parseCronJob(raw: unknown): CronJob {
  const entry = (raw && typeof raw === 'object' ? raw : {}) as RawCronJob;
  const lastEnd = asIsoOrNull(entry.last_end);
  const lastStart = asIsoOrNull(entry.last_start);
  return {
    jobname: asString(entry.jobname, '(unnamed)'),
    active: entry.active === true,
    dispatchesHttp: entry.dispatches_http === true,
    lastStatus: asIsoOrNull(entry.last_status),
    lastRunAt: lastEnd ?? lastStart,
    lastMessage: asIsoOrNull(entry.last_message),
  };
}

function isOverdue(lastRunAt: string | null, now: number, staleAfterMs: number): boolean {
  if (!lastRunAt) return false; // "never ran" is handled as its own warn, not overdue
  const parsed = Date.parse(lastRunAt);
  if (Number.isNaN(parsed)) return true; // an unparseable time is not trustworthy
  return now - parsed > staleAfterMs;
}

// INTENT: pg_cron's job_run_details.status answers "did the scheduled SQL run?",
// NOT "did the work succeed downstream". For a net.http_post job (dispatchesHttp)
// pg_cron reports 'succeeded' as soon as the request is ENQUEUED — a 4xx/5xx from
// the Edge Function never rewrites it (Codex review, PR #1125). So a green here for
// such a job means "scheduled and dispatched", and the detail says exactly that;
// it does NOT assert a 2xx response. True downstream-HTTP health belongs to a
// per-function ledger (show_payouts.failure_reason, the future operator_alerts) and
// to this board's OWN staleness self-check. Do not reword these details back into
// claiming the function succeeded.
/** Map a single cron job's last-run facts to a status + accurate human detail. */
function evaluateJob(
  job: CronJob,
  now: number,
  staleAfterMs: number
): { status: HealthStatus; detail: string } {
  if (!job.active) {
    return { status: 'fail', detail: 'is not active' };
  }
  if (!job.lastRunAt || !job.lastStatus) {
    return { status: 'warn', detail: 'scheduled but no run recorded yet' };
  }
  if (job.lastStatus === 'failed') {
    const reason = job.lastMessage ? `: ${firstLine(job.lastMessage)}` : '';
    return { status: 'fail', detail: `last run failed${reason}` };
  }
  if (isOverdue(job.lastRunAt, now, staleAfterMs)) {
    return { status: 'warn', detail: `last run (${job.lastRunAt}) is overdue` };
  }
  if (job.lastStatus === 'succeeded') {
    // Word http-dispatch jobs honestly — "dispatched", not "the function 2xx'd".
    return {
      status: 'ok',
      detail: job.dispatchesHttp
        ? 'last run dispatched (Edge Function response not checked here)'
        : 'last run succeeded',
    };
  }
  // starting / running / sending — recent and not (yet) failed.
  return { status: 'ok', detail: `last run in progress (${job.lastStatus})` };
}

/** Runbook 5.4 — the nightly payout cron is scheduled and its last run is healthy. */
function payoutCronCheck(
  jobs: CronJob[],
  now: number,
  staleAfterMs: number,
  probedAt: string
): SnapshotCheck {
  const job = jobs.find(j => j.jobname === PAYOUT_CRON_JOB);
  if (!job) {
    return {
      key: 'payout_cron',
      label: 'Nightly payout job',
      status: 'fail',
      detail: `${PAYOUT_CRON_JOB} is not scheduled`,
      checked_at: probedAt,
    };
  }
  const { status, detail } = evaluateJob(job, now, staleAfterMs);
  return {
    key: 'payout_cron',
    label: 'Nightly payout job',
    status,
    detail: `${PAYOUT_CRON_JOB} ${detail}`,
    checked_at: job.lastRunAt ?? probedAt,
  };
}

/** Every OTHER scheduled cron job's last run is healthy (generalizes 5.4). */
function backgroundJobsCheck(
  jobs: CronJob[],
  now: number,
  staleAfterMs: number,
  probedAt: string
): SnapshotCheck {
  const others = jobs.filter(j => j.jobname !== PAYOUT_CRON_JOB);
  if (others.length === 0) {
    return {
      key: 'background_jobs',
      label: 'Background jobs',
      status: 'ok',
      detail: 'no other scheduled jobs',
      checked_at: probedAt,
    };
  }
  const evaluated = others.map(job => ({ job, ...evaluateJob(job, now, staleAfterMs) }));
  const failed = evaluated.filter(e => e.status === 'fail').map(e => e.job.jobname);
  const warned = evaluated.filter(e => e.status === 'warn').map(e => e.job.jobname);

  if (failed.length > 0) {
    return {
      key: 'background_jobs',
      label: 'Background jobs',
      status: 'fail',
      detail: `${failed.length} of ${others.length} failing: ${failed.join(', ')}`,
      checked_at: probedAt,
    };
  }
  if (warned.length > 0) {
    return {
      key: 'background_jobs',
      label: 'Background jobs',
      status: 'warn',
      detail: `${warned.length} of ${others.length} need attention: ${warned.join(', ')}`,
      checked_at: probedAt,
    };
  }
  return {
    key: 'background_jobs',
    label: 'Background jobs',
    status: 'ok',
    detail: `${others.length} job${others.length === 1 ? '' : 's'} healthy`,
    checked_at: probedAt,
  };
}

/** Runbook 5.2 (proxy) — report the newest applied migration. Not full parity. */
function migrationsCheck(facts: RawProbeFacts, probedAt: string): SnapshotCheck {
  const latest = asIsoOrNull(facts.latest_migration);
  const count = typeof facts.migration_count === 'number' ? facts.migration_count : null;
  if (!latest) {
    return {
      key: 'migrations',
      label: 'Migrations',
      status: 'warn',
      detail: 'no applied migration found',
      checked_at: probedAt,
    };
  }
  const countLabel = count === null ? '' : ` (${count} applied)`;
  return {
    key: 'migrations',
    label: 'Migrations',
    status: 'ok',
    detail: `latest ${latest}${countLabel}`,
    checked_at: probedAt,
  };
}

/**
 * Build the snapshot row from raw probe facts. Never throws: a non-object facts
 * payload (probe errored or returned nothing) becomes a single `fail` check.
 */
export function buildSnapshot(facts: unknown, opts: BuildSnapshotOptions): HealthSnapshotInsert {
  const source = opts.source ?? DEFAULT_SOURCE;
  const runDurationMs = opts.runDurationMs ?? null;
  const staleAfterMs = opts.staleAfterMs ?? STALE_AFTER_MS;

  if (!facts || typeof facts !== 'object') {
    return {
      source,
      overall_status: 'fail',
      checks: [
        {
          key: 'probe',
          label: 'Health probe',
          status: 'fail',
          detail: 'system_health_probe returned no facts',
          checked_at: isoNow(opts.now),
        },
      ],
      run_duration_ms: runDurationMs,
    };
  }

  const f = facts as RawProbeFacts;
  const probedAt = asIsoOrNull(f.probed_at) ?? isoNow(opts.now);
  const jobs = Array.isArray(f.cron_jobs) ? f.cron_jobs.map(parseCronJob) : [];

  const checks: SnapshotCheck[] = [
    payoutCronCheck(jobs, opts.now, staleAfterMs, probedAt),
    backgroundJobsCheck(jobs, opts.now, staleAfterMs, probedAt),
    migrationsCheck(f, probedAt),
  ];

  return {
    source,
    overall_status: worstOf(checks.map(c => c.status)),
    checks,
    run_duration_ms: runDurationMs,
  };
}
