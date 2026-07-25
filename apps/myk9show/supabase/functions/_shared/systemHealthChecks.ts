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
  /** Raw machine-readable value carried between runs (e.g. the ringside
   * conflict counter, so the NEXT run can diff against it). The board's
   * tolerant parser ignores unknown keys. */
  counter_value?: number;
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
  anon_grants?: unknown;
}

/** Raw `anon_grants` fact block from the probe (MYK9-93). */
export interface RawAnonGrants {
  tables?: unknown;
  columns?: unknown;
  defaults?: unknown;
}

/** One anon ACL row. `privs` is the aclitem privilege letters: r = SELECT,
 * a = INSERT, w = UPDATE, d = DELETE, D = TRUNCATE, x = REFERENCES, t = TRIGGER. */
interface AnonGrantRow {
  name: string;
  column: string | null;
  privs: string;
}

interface AnonDefaultRow {
  grantor: string;
  objtype: string;
  privs: string;
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

/**
 * MYK9-93 anon-grant allowlist — table name → the exact aclitem privilege letters
 * anon may hold. Mirrors 20260725160000/170000/180000. `r` = SELECT, `a` = INSERT.
 *
 * `public.entries` is deliberately ABSENT: it carries a 14-column grant and must have
 * no table-level SELECT, so its presence here at all is a failure (see anonGrantsCheck).
 * `dogs` and `people` are likewise column-only — grants that exist purely so anon
 * PostgREST embeds resolve to null instead of 42501; RLS admits them zero rows.
 */
export const ANON_TABLE_ALLOWLIST: Readonly<Record<string, string>> = {
  // Public reference data.
  rule_organizations: 'r',
  rule_sports: 'r',
  rulebooks: 'r',
  rules: 'r',
  sport_class_rules: 'r',
  sport_templates: 'r',
  sport_titles: 'r',
  show_templates: 'r',
  template_fields: 'r',
  user_guide: 'r',
  // Published show data, further row-filtered by RLS on show status.
  shows: 'r',
  trials: 'r',
  classes: 'r',
  armbands: 'r',
  judge_assignments: 'r',
  clubs: 'r',
  achievements: 'r',
  show_visibility_settings: 'r',
  trial_visibility_overrides: 'r',
  class_visibility_overrides: 'r',
  // The one anon write path: the pre-launch waitlist signup form. INSERT only.
  platform_waitlist: 'a',
  // The definer-rights public results release gate.
  view_public_entry_results: 'r',
};

/** Tables where anon legitimately holds COLUMN-level (never table-level) grants. */
export const ANON_COLUMN_TABLES: readonly string[] = ['entries', 'dogs', 'people'];

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

/** Tolerant like parseCronJob: any malformed row degrades to empty strings, which the
 * allowlist comparison then reports as drift rather than silently skipping. */
function parseAnonGrant(raw: unknown): AnonGrantRow {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    name: asString(row.name, '(unknown)'),
    column: typeof row.column === 'string' ? row.column : null,
    privs: asString(row.privs),
  };
}

function parseAnonDefault(raw: unknown): AnonDefaultRow {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    grantor: asString(row.grantor, '(unknown)'),
    objtype: asString(row.objtype),
    privs: asString(row.privs),
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

/** Ringside OCC conflict volume since the previous snapshot (2026-07-11 storm).
 * The probe reports a monotonic counter (`ringside_conflict_seq`); status comes
 * from the delta vs the previous snapshot's stored `counter_value`. Missing
 * baseline or a counter regression (sequence reset/restore) reads `ok` with an
 * explanatory note — never a false failure. */
function ringsideConflictsCheck(
  facts: RawProbeFacts,
  previousCounter: number | null | undefined,
  probedAt: string
): SnapshotCheck {
  const base = { key: 'ringside_conflicts', label: 'Ringside conflicts', checked_at: probedAt };
  const counter =
    typeof facts.ringside_conflict_counter === 'number' ? facts.ringside_conflict_counter : null;

  if (counter === null) {
    // Probe predates the counter (edge fn deployed ahead of the migration) or
    // returned garbage — visible misconfiguration, not a storm verdict.
    return { ...base, status: 'warn', detail: 'probe did not report ringside_conflict_counter' };
  }
  if (previousCounter === null || previousCounter === undefined) {
    return {
      ...base,
      status: 'ok',
      detail: `baseline recorded (counter ${counter}); delta available from next run`,
      counter_value: counter,
    };
  }
  const delta = counter - previousCounter;
  if (delta < 0) {
    return {
      ...base,
      status: 'ok',
      detail: `counter regressed (${previousCounter} -> ${counter}), baseline reset`,
      counter_value: counter,
    };
  }
  const status: HealthStatus =
    delta >= RINGSIDE_CONFLICTS_FAIL_DELTA
      ? 'fail'
      : delta >= RINGSIDE_CONFLICTS_WARN_DELTA
        ? 'warn'
        : 'ok';
  return {
    ...base,
    status,
    detail: `${delta} conflicts since previous snapshot (counter ${counter})`,
    counter_value: counter,
  };
}

/**
 * MYK9-93 — anon-grant drift against the APPLIED ACLs.
 *
 * The migration-text contract test can only see grants written in a committed .sql
 * file. It cannot see one that arrives from an ALTER DEFAULT PRIVILEGES, the dashboard,
 * or a restore — which is how `dog_favorites` shipped with anon holding full CRUD
 * despite a migration granting it nothing. This check reads what the database actually
 * has, so drift from ANY source surfaces on /admin/health within a day.
 *
 * Both halves matter. `public.entries` deliberately carries a column-level allowlist
 * with NO table-level SELECT: a table-only check would call a blanket re-grant healthy.
 */
function anonGrantsCheck(facts: RawProbeFacts, probedAt: string): SnapshotCheck {
  const base = { key: 'anon_grants', label: 'Anon grants', checked_at: probedAt } as const;
  const raw = facts.anon_grants;
  if (!raw || typeof raw !== 'object') {
    // Probe predates this fact (function not yet redeployed) — visible, not alarming.
    return { ...base, status: 'warn', detail: 'probe returned no anon_grants facts' };
  }

  const { tables, columns, defaults } = raw as RawAnonGrants;
  const tableRows = Array.isArray(tables) ? tables.map(parseAnonGrant) : [];
  const columnRows = Array.isArray(columns) ? columns.map(parseAnonGrant) : [];
  const defaultRows = Array.isArray(defaults) ? defaults.map(parseAnonDefault) : [];

  const problems: string[] = [];

  for (const row of tableRows) {
    const expected = ANON_TABLE_ALLOWLIST[row.name];
    if (expected === undefined) {
      problems.push(`${row.name} (${row.privs}) not on the anon allowlist`);
    } else if (row.privs !== expected) {
      problems.push(`${row.name} has '${row.privs}', expected '${expected}'`);
    }
  }

  // entries must stay column-scoped. Its absence from the table list IS the invariant.
  if (tableRows.some(row => row.name === 'entries')) {
    problems.push('entries has a TABLE-level anon grant — the release-gate allowlist is bypassed');
  }

  for (const row of columnRows) {
    if (!ANON_COLUMN_TABLES.includes(row.name)) {
      problems.push(`unexpected column grant ${row.name}.${row.column ?? '?'} (${row.privs})`);
    } else if (row.privs !== 'r') {
      problems.push(`${row.name}.${row.column ?? '?'} has '${row.privs}', expected read-only`);
    }
  }

  // Any grantor other than supabase_admin means a revoked default came back.
  for (const row of defaultRows) {
    if (row.grantor !== 'supabase_admin') {
      problems.push(`default privileges for anon restored by ${row.grantor} (${row.objtype})`);
    }
  }

  if (problems.length > 0) {
    return { ...base, status: 'fail', detail: problems.join('; ') };
  }

  const writeable = tableRows.filter(row => /[awdDxt]/.test(row.privs)).length;
  return {
    ...base,
    status: 'ok',
    detail:
      `${tableRows.length} table grants (${writeable} write), ` +
      `${columnRows.length} column grants, all on the allowlist`,
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
    ringsideConflictsCheck(f, opts.previousConflictCounter, probedAt),
    anonGrantsCheck(f, probedAt),
  ];

  return {
    source,
    overall_status: worstOf(checks.map(c => c.status)),
    checks,
    run_duration_ms: runDurationMs,
  };
}
