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

import { anonGrantsCheck } from './anonGrantChecks.ts';
import { appliedAclCheck } from './appliedAclChecks.ts';

export type HealthStatus = 'ok' | 'warn' | 'fail';

/** One check as stored in the snapshot's `checks` JSONB (snake_case keys — the
 * board's parser reads `entry.checked_at`). */
export interface SnapshotCheck {
  key: string;
  label: string;
  status: HealthStatus;
  detail: string;
  checked_at: string | null;
  /** Raw machine-readable value carried between runs (e.g. the ringside
   * conflict counter, so the NEXT run can diff against it). The board's
   * tolerant parser ignores unknown keys. */
  counter_value?: number;
  /**
   * Whether an amber result means "we looked and it is degraded" (`proven`) or
   * "this check cannot prove anything either way" (`unprovable`).
   *
   * The board renders three buckets — passing / amber / failing — and the design
   * calls the amber one **Unverified**. That word is only true for some of what
   * lands there: a dispatch-only payout check genuinely cannot know, but an
   * overdue cron job is a *proven* degradation and calling it "Unverified" would
   * misreport it. Rather than overload `status`, the runner says which it means
   * and the board picks the honest word. Absent = `proven`.
   */
  verification?: 'proven' | 'unprovable';
  /** Events observed in THIS run's window, where `counter_value` is the running
   * total. Named apart from `counter_value` deliberately: the two were conflated
   * in one prose string ("N conflicts since previous snapshot (counter M)"),
   * which is what made an accurate 1.4M reading look like a broken counter. */
  delta_value?: number;
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
  ringside_conflict_counter?: unknown;
  /** MYK9-115 admission-control breaker row, or null where it does not exist. */
  ringside_containment?: unknown;
  /** Terminal-state rollup of public.show_payouts (TICKET-2). */
  payout_ledger?: unknown;
  anon_grants?: unknown;
  applied_acl_grants?: unknown;
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
  /** The previous snapshot's ringside_conflicts counter_value, or null when no
   * baseline exists (first run, prior snapshot without the check, fetch
   * failure). The runner supplies it; the delta logic lives here. */
  previousConflictCounter?: number | null;
  /** `created_at` of the snapshot `previousConflictCounter` came from, so the
   * delta can be expressed as a RATE. A raw 24h delta is close to unreadable —
   * "1,428,120 since the last snapshot" reads as a broken counter, while
   * "≈992/min" reads as the storm it actually was. Null = fall back to the
   * absolute-delta thresholds. */
  previousSnapshotAt?: string | null;
}

// Match the board's STALE_AFTER_MS (systemHealthSelectors.ts) so a run the board
// would call stale is the same window the runner uses to warn on an overdue job.
export const STALE_AFTER_MS = 26 * 60 * 60 * 1000; // ~26 hours
export const PAYOUT_CRON_JOB = 'nightly-show-payouts';
export const DEFAULT_SOURCE = 'cron-health-check';

// Ringside OCC conflict-storm thresholds (delta between daily snapshots).
// Legitimate double-scoring conflicts are a handful per show day; the
// 2026-07-11 storm ran ~250k/hour — either threshold catches a real storm
// while staying orders of magnitude above honest traffic.
export const RINGSIDE_CONFLICTS_WARN_DELTA = 1_000;
export const RINGSIDE_CONFLICTS_FAIL_DELTA = 10_000;

// Rate thresholds, used whenever the previous snapshot's timestamp is known. The
// fail rate matches `ringside_containment.trip_conflicts_per_minute` (300/min) on
// purpose: the board should go red at the same point the breaker trips, so the two
// never disagree about whether ringside is in trouble.
export const RINGSIDE_CONFLICTS_WARN_RATE_PER_MIN = 60;
export const RINGSIDE_CONFLICTS_FAIL_RATE_PER_MIN = 300;

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
/** Map a single cron job's last-run facts to a status + accurate human detail.
 *
 * `dispatchIsUnverified` decides what a dispatch-only success is WORTH. Left
 * false, "succeeded" reads `ok` with honest wording. Set true (the money path —
 * TICKET-2), a dispatch-only success can never reach `ok`: it is `warn`, which
 * the board renders as **Unverified**. Unverified is not a softer Fail; it means
 * this check cannot prove anything either way, and saying `ok` there is the one
 * outcome worse than saying nothing. */
function evaluateJob(
  job: CronJob,
  now: number,
  staleAfterMs: number,
  dispatchIsUnverified = false
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
    if (job.dispatchesHttp) {
      return {
        status: dispatchIsUnverified ? 'warn' : 'ok',
        detail: dispatchIsUnverified
          ? 'last run dispatched, but the Edge Function response is never read — this check cannot fail'
          : 'last run dispatched (Edge Function response not checked here)',
      };
    }
    return { status: 'ok', detail: 'last run succeeded' };
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
  // TICKET-2: dispatch-only success is Unverified on the money path, never OK.
  const { status, detail } = evaluateJob(job, now, staleAfterMs, true);
  // Amber here is the genuine "cannot prove it either way" case; amber from an
  // overdue or never-run job is a proven degradation and keeps the default.
  const unprovable = status === 'warn' && job.lastStatus === 'succeeded';
  return {
    key: 'payout_cron',
    label: 'Nightly payout job',
    status,
    detail: `${PAYOUT_CRON_JOB} ${detail}`,
    checked_at: job.lastRunAt ?? probedAt,
    ...(unprovable ? { verification: 'unprovable' as const } : {}),
  };
}

/** Rollup of public.show_payouts as returned by the probe. */
interface PayoutLedgerFacts {
  total: number;
  failed: number;
  failedAmountCents: number;
  inFlight: number;
  staleInFlight: number;
  oldestInFlightAt: string | null;
  lastCompletedAt: string | null;
  failureReasons: string[];
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
}

/** Tolerant like every other parser here: a malformed payload yields null, which
 * the check reports as a visible warn rather than a crash or a false green. */
function parsePayoutLedger(raw: unknown): PayoutLedgerFacts | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;
  // EVERY count must be present. Validating only `total` and letting asCount
  // coerce the rest to zero means a truncated probe payload with total=5 and no
  // `failed` key renders "all 5 payouts settled" — a silent green produced by a
  // broken probe, which is the exact failure this check exists to prevent.
  for (const key of ['total', 'failed', 'in_flight', 'stale_in_flight']) {
    if (typeof f[key] !== 'number' || !Number.isFinite(f[key] as number)) return null;
  }
  return {
    total: asCount(f.total),
    failed: asCount(f.failed),
    failedAmountCents: asCount(f.failed_amount_cents),
    inFlight: asCount(f.in_flight),
    staleInFlight: asCount(f.stale_in_flight),
    oldestInFlightAt: asIsoOrNull(f.oldest_in_flight_at),
    lastCompletedAt: asIsoOrNull(f.last_completed_at),
    failureReasons: Array.isArray(f.failure_reasons)
      ? f.failure_reasons.filter((r): r is string => typeof r === 'string')
      : [],
  };
}

/** Render cents as plain dollars — "$4,180.00". Money in a health detail must be
 * unambiguous; 418000 is not. */
function formatUsd(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// INTENT: TICKET-2. This is the outcome half of the payout pair. `payout_cron`
// answers "did the scheduled SQL dispatch?" and structurally cannot answer more;
// this check answers "did the money actually land?" by reading the ledger's own
// terminal states. Do not merge the two back into one check — the whole point is
// that a green dispatch and a failed transfer are different facts, and the board
// must be able to show one red while the other is amber.
/** Every expected payout reached a terminal state, and none of them failed. */
function payoutLedgerCheck(facts: RawProbeFacts, probedAt: string): SnapshotCheck {
  const base = { key: 'payout_ledger', label: 'Payout ledger', checked_at: probedAt };
  const ledger = parsePayoutLedger(facts.payout_ledger);

  if (!ledger) {
    return {
      ...base,
      status: 'warn',
      detail: 'probe did not report payout_ledger',
      verification: 'unprovable',
    };
  }
  if (ledger.failed > 0) {
    const reasons = ledger.failureReasons.length
      ? ` — ${ledger.failureReasons.slice(0, 3).join('; ')}`
      : '';
    return {
      ...base,
      status: 'fail',
      detail: `${ledger.failed} of ${ledger.total} payouts failed, ${formatUsd(ledger.failedAmountCents)} unpaid${reasons}`,
      delta_value: ledger.failed,
    };
  }
  if (ledger.staleInFlight > 0) {
    const since = ledger.oldestInFlightAt ? `, oldest since ${ledger.oldestInFlightAt}` : '';
    return {
      ...base,
      status: 'fail',
      detail: `${ledger.staleInFlight} payout${ledger.staleInFlight === 1 ? '' : 's'} never reached a terminal state${since} — the run dispatched but did not finish`,
      delta_value: ledger.staleInFlight,
    };
  }
  if (ledger.total === 0) {
    return { ...base, status: 'ok', detail: 'no payouts recorded yet', delta_value: 0 };
  }
  if (ledger.inFlight > 0) {
    return {
      ...base,
      status: 'ok',
      detail: `${ledger.inFlight} of ${ledger.total} payouts in flight, none overdue`,
      delta_value: 0,
    };
  }
  const last = ledger.lastCompletedAt ? ` (last completed ${ledger.lastCompletedAt})` : '';
  return {
    ...base,
    status: 'ok',
    detail: `all ${ledger.total} payouts settled${last}`,
    delta_value: 0,
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

/** Pull the ringside_conflicts counter_value out of a previous snapshot's raw
 * `checks` JSONB. Tolerant like the board's parser: any malformed shape yields
 * null (= no baseline), never a throw. */
export function extractConflictCounter(checks: unknown): number | null {
  if (!Array.isArray(checks)) return null;
  for (const raw of checks) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as { key?: unknown; counter_value?: unknown };
    if (entry.key === 'ringside_conflicts' && typeof entry.counter_value === 'number') {
      return entry.counter_value;
    }
  }
  return null;
}

/** MYK9-115 admission-control breaker state, as returned by the probe. */
interface ContainmentFacts {
  state: string;
  trippedAt: string | null;
  tripReason: string | null;
  backpressureMs: number | null;
}

function parseContainment(raw: unknown): ContainmentFacts | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;
  if (typeof f.state !== 'string') return null;
  return {
    state: f.state,
    trippedAt: asIsoOrNull(f.tripped_at),
    tripReason: asIsoOrNull(f.trip_reason),
    backpressureMs: typeof f.backpressure_ms === 'number' ? f.backpressure_ms : null,
  };
}

/** Elapsed minutes between two ISO timestamps, or null if either is unusable. */
function minutesBetween(fromIso: string | null | undefined, toMs: number): number | null {
  if (!fromIso) return null;
  const from = Date.parse(fromIso);
  if (Number.isNaN(from)) return null;
  const minutes = (toMs - from) / 60_000;
  return minutes > 0 ? minutes : null;
}

// INTENT: TICKET-1. The counter is NOT broken and must not be "corrected" into
// silence. Between 2026-07-28 and 2026-07-31 it recorded 34,421,500 real nextval()
// calls at the two authorized OCC-conflict sites in ringside_update_entry, driven by
// the load-rehearsal harness; the MYK9-115 breaker tripped at 2026-07-31T00:27Z at a
// measured 2,884/min and the counter has been frozen ever since. Every number it
// reported was true.
//
// So do NOT add the originally-proposed "conflicts exceeding total entries means the
// counter is implausible" bound. Conflicts are events and entries are rows; one client
// retry loop against a single entry produces unbounded conflicts. That bound would have
// classified a genuine 34M-event incident as a counter fault and hidden it. Likewise do
// not reset the baseline: the counter's monotonicity is the only record that the storm
// happened, and a reset makes the next run's delta a lie.
//
// What this check owes the reader is CONTEXT, not a smaller number: the rate rather
// than a bare 24h delta, and the breaker's state — whether ringside scoring is being
// throttled right now is the most operationally important ringside fact there is, and
// it was previously not on the board at all.
/** Ringside OCC conflict volume and admission-control state. The probe reports a
 * monotonic counter (`ringside_conflict_seq`); status comes from the RATE implied by
 * the delta vs the previous snapshot, and from the MYK9-115 breaker. Missing baseline
 * or a counter regression (sequence reset/restore) reads `ok` with an explanatory
 * note — never a false failure. */
function ringsideConflictsCheck(
  facts: RawProbeFacts,
  previousCounter: number | null | undefined,
  probedAt: string,
  opts: { now: number; previousSnapshotAt?: string | null }
): SnapshotCheck {
  const base = { key: 'ringside_conflicts', label: 'Ringside conflicts', checked_at: probedAt };
  const counter =
    typeof facts.ringside_conflict_counter === 'number' ? facts.ringside_conflict_counter : null;
  const containment = parseContainment(facts.ringside_containment);

  // A tripped breaker is a finding in its own right: scoring writes are being
  // rate-limited server-side and clients are being told to pause. It outranks any
  // delta, including a delta of zero — zero conflicts while contained means the
  // containment is working, not that the problem is gone.
  const containedNote =
    containment && containment.state === 'contained'
      ? ` Ringside scoring is CONTAINED since ${containment.trippedAt ?? 'an unrecorded time'}` +
        `${containment.tripReason ? ` (${containment.tripReason})` : ''}` +
        `${containment.backpressureMs ? `; conflicting writes back off ${containment.backpressureMs}ms and receive RS429` : ''}.`
      : '';

  if (counter === null) {
    // Probe predates the counter (edge fn deployed ahead of the migration) or
    // returned garbage — visible misconfiguration, not a storm verdict.
    return {
      ...base,
      status: 'warn',
      detail: `probe did not report ringside_conflict_counter.${containedNote}`,
      verification: 'unprovable',
    };
  }
  if (previousCounter === null || previousCounter === undefined) {
    return {
      ...base,
      status: containedNote ? 'fail' : 'ok',
      detail: `baseline recorded (total ${counter}); rate available from next run.${containedNote}`,
      counter_value: counter,
    };
  }
  const delta = counter - previousCounter;
  if (delta < 0) {
    return {
      ...base,
      status: containedNote ? 'fail' : 'ok',
      detail: `counter regressed (${previousCounter} -> ${counter}), baseline reset.${containedNote}`,
      counter_value: counter,
      delta_value: 0,
    };
  }

  const minutes = minutesBetween(opts.previousSnapshotAt, opts.now);
  const ratePerMinute = minutes === null ? null : delta / minutes;

  // Prefer the rate; fall back to the absolute delta only when the window is unknown.
  let status: HealthStatus;
  if (ratePerMinute !== null) {
    status =
      ratePerMinute >= RINGSIDE_CONFLICTS_FAIL_RATE_PER_MIN
        ? 'fail'
        : ratePerMinute >= RINGSIDE_CONFLICTS_WARN_RATE_PER_MIN
          ? 'warn'
          : 'ok';
  } else {
    status =
      delta >= RINGSIDE_CONFLICTS_FAIL_DELTA
        ? 'fail'
        : delta >= RINGSIDE_CONFLICTS_WARN_DELTA
          ? 'warn'
          : 'ok';
  }
  if (containedNote) status = 'fail';

  const rateLabel =
    ratePerMinute === null
      ? 'rate unknown (no previous run time)'
      : `${Math.round(ratePerMinute).toLocaleString('en-US')}/min over ${Math.round(minutes as number).toLocaleString('en-US')} min`;

  return {
    ...base,
    status,
    detail:
      `${delta.toLocaleString('en-US')} conflicts this window — ${rateLabel}; ` +
      `running total ${counter.toLocaleString('en-US')}.${containedNote}`,
    counter_value: counter,
    delta_value: delta,
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
    payoutLedgerCheck(f, probedAt),
    backgroundJobsCheck(jobs, opts.now, staleAfterMs, probedAt),
    migrationsCheck(f, probedAt),
    ringsideConflictsCheck(f, opts.previousConflictCounter, probedAt, {
      now: opts.now,
      previousSnapshotAt: opts.previousSnapshotAt,
    }),
    anonGrantsCheck(f.anon_grants, probedAt),
    appliedAclCheck(f.applied_acl_grants, probedAt),
  ];

  return {
    source,
    overall_status: worstOf(checks.map(c => c.status)),
    checks,
    run_duration_ms: runDurationMs,
  };
}
